const crypto = require("crypto");

class ParserAtc {
  constructor(buffer, device) {
    this.buffer = buffer;
    this.device = device;
  }

  parse() {
    if (this.buffer.length === 15) { // pvvx
      let voltage = this.buffer.readInt16LE(10);
      return {
        temp: this.buffer.readInt16LE(6) / 100,
        humidity: this.buffer.readUInt16LE(8) / 100,
        battery_voltage: voltage > 1000 ? voltage / 1000 : voltage,
        battery: this.buffer.readUInt8(12),
        counter: this.buffer.readUInt8(13),
        switch: (this.buffer.readInt8(14) >> 1) & 1,
        opening: (this.buffer.readInt8(14) ^ 1) & 1,
        type: "PVVX (No encryption)"
      }
    } else if (this.buffer.length === 13) {
      return {
        temp: this.buffer.readInt16BE(6) / 10,
        humidity: this.buffer.readUInt8(8),
        battery: this.buffer.readUInt8(9),
        battery_voltage: this.buffer.readInt16BE(10) / 1000,
        type: "ATC (ATC1441)"
      }
    } else if (this.buffer.length === 11) {
      const decoded         = this.decryptPayload();
      const battery_voltage = 2.2 + (3.1 - 2.2) * (decoded.readInt8(3) / 100);
      return {
        temp: decoded.readInt16LE(0) / 100,
        humidity: decoded.readUInt16LE(2) / 100,
        battery_voltage,
        battery: decoded.readInt8(4),
        switch: (decoded.readInt8(5) >> 1) & 1,
        opening: (decoded.readInt8(5) ^ 1) & 1,
        type: "PVVX (encryption)"
      }
    } else if (this.buffer.length === 8) {
      const decoded         = this.decryptPayload();
      const battery         = decoded.readInt8(2) & 0x7f;
      const battery_voltage = 2.2 + (3.1 - 2.2) * (battery / 100);
      const trigger         = decoded.readInt8(2) >> 7;

      return {
        temp: decoded.readUInt8(0) / 2 - 40,
        humidity: decoded.readUInt8(1) / 2,
        battery,
        battery_voltage,
        switch: trigger,
        type: "ATC (Atc1441 encryption)"
      }
    }
  }

  decryptPayload() {
    if (this.device.bind_key == null) {
      throw Error("Sensor data is encrypted. Please configure a bind_key.");
    }
    const nonce = Buffer.concat([
      Buffer.from(this.device.mac.replace(/:/ig, ""), "hex").reverse(), // reverse mac
      Uint8Array.from([
        this.buffer.length + 3, // length advertising data ( type + uuid 16 + service data )
        0x16, // type
        0x1a, // UUID 181a
        0x18
      ]),
      this.buffer.slice(0, 1) // counter
    ]);

    const decipher   = crypto.createDecipheriv(
      "aes-128-ccm",
      Buffer.from(this.device.bind_key, "hex"), //key
      nonce, //iv
      {authTagLength: 4}
    );
    const ciphertext = this.buffer.slice(1, this.buffer.length - 4);

    decipher.setAuthTag(this.buffer.slice(-4));
    decipher.setAAD(Buffer.from("11", "hex"), {
      plaintextLength: ciphertext.length
    });

    const decoded = decipher.update(ciphertext);

    decipher.final();
    return decoded;
  }
}

module.exports = {
  ParserAtc
}
