/**
 * This parser was originally ported from:
 *
 * https://github.com/hannseman/homebridge-mi-hygrothermograph/blob/master/lib/parser.js
 */
const crypto = require("crypto");

const SERVICE_DATA_UUID = "fe95";

const FrameControlFlags = {
  isFactoryNew: 1 << 0,
  isConnected: 1 << 1,
  isCentral: 1 << 2,
  isEncrypted: 1 << 3,
  hasMacAddress: 1 << 4,
  hasCapabilities: 1 << 5,
  hasEvent: 1 << 6,
  hasCustomData: 1 << 7,
  hasSubtitle: 1 << 8,
  hasBinding: 1 << 9
};

const CapabilityFlags = {
  connectable: 1 << 0,
  central: 1 << 1,
  secure: 1 << 2,
  io: (1 << 3) | (1 << 4)
};

const EventTypes = {
  easyPairing: 0x0002,
  button: 0x1001,
  movingWithLight: 0x000F,//0x000F // Someone is moving (with light)
  //0x1017 //  No one moves
  //0x1018 // Light intensity
  temperature: 4100,
  humidity: 4102,
  illuminance: 4103,
  moisture: 4104,
  fertility: 4105,
  battery: 4106,
  temperatureAndHumidity: 4109
};

const xiaomiProductName = {
  0x005d: "HHCCPOT002",
  0x0098: "HHCCJCY01",
  0x01d8: "Stratos",
  0x0153: "YEE-RC",
  0x02df: "JQJCY01YM",
  0x03b6: "YLKG08YL",
  0x03bc: "GCLS002",
  0x040a: "WX08ZM",
  0x045b: "LYWSD02",
  0x055b: "LYWSD03MMC",
  0x0576: "CGD1",
  0x0347: "CGG1",
  0x01aa: "LYWSDCGQ",
  0x03dd: "MUE4094RT",
  0x07f6: "MJYD02YLA",
  0x0387: "MHOC401"
};

class Parser {
  constructor(buffer, bindKey = null) {
    this.baseByteLength = 5;
    if (buffer == null) {
      throw new Error("A buffer must be provided.");
    }
    this.buffer = buffer;
    if (buffer.length < this.baseByteLength) {
      throw new Error(
        `Service data length must be >= 5 bytes. ${this.toString()}`
      );
    }
    this.bindKey = bindKey;
  }

  parse() {
    this.frameControl = this.parseFrameControl();
    this.version      = this.parseVersion();
    this.productId    = this.parseProductId();
    this.frameCounter = this.parseFrameCounter();
    this.macAddress   = this.parseMacAddress();
    this.capabilities = this.parseCapabilities();

    if (this.frameControl.isEncrypted) {
      if (this.version <= 3) {
        this.decryptLegacyPayload();
      } else {
        this.decryptPayload();
      }
    }

    this.eventType   = this.parseEventType();
    this.eventLength = this.parseEventLength();
    this.event       = this.parseEventData();
    this.productName = xiaomiProductName[this.productId] || null;

    return {
      frameControl: this.frameControl,
      event: this.event,
      productId: this.productId,
      frameCounter: this.frameCounter,
      macAddress: this.macAddress,
      eventType: this.eventType,
      capabilities: this.capabilities,
      eventLength: this.eventLength,
      version: this.version
    };
  }

  parseFrameControl() {
    const frameControl = this.buffer.readUInt16LE(0);
    return Object.keys(FrameControlFlags).reduce((map, flag) => {
      map[flag] = (frameControl & FrameControlFlags[flag]) !== 0;
      return map;
    }, {});
  }

  parseVersion() {
    return this.buffer.readUInt8(1) >> 4;
  }

  parseProductId() {
    return this.buffer.readUInt16LE(2);
  }

  parseFrameCounter() {
    return this.buffer.readUInt8(4);
  }

  parseMacAddress() {
    if (!this.frameControl.hasMacAddress) {
      return null;
    }
    const macBuffer = this.buffer.slice(
      this.baseByteLength,
      this.baseByteLength + 6
    );
    return Buffer.from(macBuffer)
      .reverse()
      .toString("hex");
  }

  get capabilityOffset() {
    if (!this.frameControl.hasMacAddress) {
      return this.baseByteLength;
    }
    return 11;
  }

  parseCapabilities() {
    if (!this.frameControl.hasCapabilities) {
      return null;
    }
    const capabilities = this.buffer.readUInt8(this.capabilityOffset);
    return Object.keys(CapabilityFlags).reduce((map, flag) => {
      map[flag] = (capabilities & CapabilityFlags[flag]) !== 0;
      return map;
    }, {});
  }

  get eventOffset() {
    let offset = this.baseByteLength;
    if (this.frameControl.hasMacAddress) {
      offset = 11;
    }
    if (this.frameControl.hasCapabilities) {
      offset += 1;
    }

    return offset;
  }

  parseEventType() {
    if (!this.frameControl.hasEvent) {
      return null;
    }
    return this.buffer.readUInt16LE(this.eventOffset);
  }

  parseEventLength() {
    if (!this.frameControl.hasEvent) {
      return null;
    }
    return this.buffer.readUInt8(this.eventOffset + 2);
  }

  decryptPayload() {
    const msgLength   = this.buffer.length;
    const eventLength = msgLength - this.eventOffset;

    if (eventLength < 3) {
      return;
    }
    if (this.bindKey == null) {
      throw Error("Sensor data is encrypted. Please configure a bindKey.");
    }

    const encryptedPayload = this.buffer.slice(this.eventOffset, msgLength);

    const nonce = Buffer.concat([
      this.buffer.slice(5, 11), //mac_reversed
      this.buffer.slice(2, 4), //device_type
      this.buffer.slice(4, 5), //frame_cnt
      encryptedPayload.slice(-7, -4) //ext_cnt
    ]);

    const decipher = crypto.createDecipheriv(
      "aes-128-ccm",
      Buffer.from(this.bindKey, "hex"), //key
      nonce, //iv
      {authTagLength: 4}
    );

    const ciphertext = encryptedPayload.slice(0, -7);

    decipher.setAuthTag(encryptedPayload.slice(-4));
    decipher.setAAD(Buffer.from("11", "hex"), {
      plaintextLength: ciphertext.length
    });

    const receivedPlaintext = decipher.update(ciphertext);

    decipher.final();

    this.buffer = Buffer.concat([
      this.buffer.slice(0, this.eventOffset),
      receivedPlaintext
    ]);
  }

  decryptLegacyPayload() {
    const msgLength   = this.buffer.length;
    const eventLength = msgLength - this.eventOffset;

    if (eventLength < 3) {
      return;
    }
    if (this.bindKey == null) {
      throw Error("Sensor data is encrypted. Please configure a bindKey.");
    }

    const encryptedPayload = this.buffer.slice(this.eventOffset, this.eventOffset + 6);

    const nonce = Buffer.concat([
      Buffer.from("01", "hex"),
      this.buffer.slice(0, 5),
      this.buffer.slice(-4, -1),
      this.buffer.slice(5, 10), //mac_reversed
      Buffer.from("0001", "hex"),
    ]);

    const bindKeyBuffer = Buffer.from(this.bindKey, "hex");
    const key           = Buffer.concat([
      bindKeyBuffer.slice(0, 6),
      Buffer.from("8d3d3c97", "hex"),
      bindKeyBuffer.slice(6)
    ]);

    const decipher = crypto.createCipheriv("aes-128-ctr", key, nonce);

    const receivedPlaintext = decipher.update(encryptedPayload);
    decipher.final();

    this.buffer = Buffer.concat([
      this.buffer.slice(0, this.eventOffset),
      receivedPlaintext
    ]);
  }

  parseEventData() {
    if (!this.frameControl.hasEvent) {
      return null;
    }
    switch (this.eventType) {
      case EventTypes.easyPairing: {
        return this.parseEasyPairing();
      }
      case EventTypes.button: {
        return this.parseButton();
      }
      case EventTypes.temperature: {
        return this.parseTemperatureEvent();
      }
      case EventTypes.humidity: {
        return this.parseHumidityEvent();
      }
      case EventTypes.battery: {
        return this.parseBatteryEvent();
      }
      case EventTypes.temperatureAndHumidity: {
        return this.parseTemperatureAndHumidityEvent();
      }
      case EventTypes.illuminance: {
        return this.parseIlluminanceEvent();
      }
      case EventTypes.fertility: {
        return this.parseFertilityEvent();
      }
      case EventTypes.moisture: {
        return this.parseMoistureEvent();
      }
      case EventTypes.movingWithLight: {
        return this.parseMovingWithLightEvent();
      }
      default: {
        throw new Error(
          `Unknown event type: ${this.eventType}. ${this.toString()} - ${this.buffer.slice(this.eventOffset)}`
        );
      }
    }
  }

  parseTemperatureEvent() {
    return {
      temperature: this.buffer.readInt16LE(this.eventOffset + 3) / 10
    };
  }

  parseHumidityEvent() {
    return {
      humidity: this.buffer.readUInt16LE(this.eventOffset + 3) / 10
    };
  }

  parseBatteryEvent() {
    return {
      battery: this.buffer.readUInt8(this.eventOffset + 3)
    };
  }

  parseTemperatureAndHumidityEvent() {
    const temperature = this.buffer.readInt16LE(this.eventOffset + 3) / 10;
    const humidity    = this.buffer.readUInt16LE(this.eventOffset + 5) / 10;
    return {temperature, humidity};
  }

  parseIlluminanceEvent() {
    return {
      illuminance: this.buffer.readUIntLE(this.eventOffset + 3, 3)
    };
  }

  parseFertilityEvent() {
    return {
      fertility: this.buffer.readInt16LE(this.eventOffset + 3)
    };
  }

  parseMoistureEvent() {
    return {
      moisture: this.buffer.readInt8(this.eventOffset + 3)
    };
  }

  parseMovingWithLightEvent() {
    //@todo Qingping light
    return {
      motion: 1,
      illuminance: this.buffer.readUIntLE(this.eventOffset + 3, 3)
    };
  }

  toString() {
    return this.buffer.toString("hex");
  }

  parseButton() {
    const actions = Object.freeze({
      0x00: "single",
      0x01: "double",
      0x02: "long_press",
      0x03: "triple"
    });
    const button  = this.buffer.readInt16LE(this.eventOffset + 3);
    const action  = this.buffer.readInt8(this.eventOffset + 5);
    return {
      button,
      action: actions[action] || null
    };
  }

  parseEasyPairing() {
    return {objectID: this.buffer.readInt16LE(this.eventOffset + 3)};
  }
}

module.exports = {
  Parser,
  EventTypes,
  SERVICE_DATA_UUID
};
