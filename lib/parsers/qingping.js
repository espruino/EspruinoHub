const ProductName = {
    0x01: "CGG1 Goose",
    0x07: "CGG1",
    0x09: "CGP1W",
    0x0C: "CGD1",
    0x12: "CGPR1",
};

const EventTypes = {
    temperatureAndHumidity: {
        id: 0x01,
        size: 4,
        parser: (b, p) => {
            return {
                temperature: b.readInt16LE(p) / 10,
                humidity: b.readInt16LE(p + 2) / 10,
            }
        }
    },
    battery: {
        id: 0x02,
        size: 1,
        parser: (b, p) => {
            return {battery: b.readUInt8(p)};
        }
    },
    pressure: {
        id: 0x07,
        size: 2,
        parser: (b, p) => {
            return {pressure: b.readInt16LE(p) / 100.0};
        }
    },
    motionWithIlluminance: {
        id: 0x08,
        size: 4,
        parser: (b, p) => {
            return {
                motion: b.readUInt8(p),
                illuminance: b.readUInt16LE(p + 1) + b.readUInt8(p + 3) * 256
            }
        }
    },
    illuminance: {
        id: 0x09,
        size: 4,
        parser: (b, p) => {
            return {illuminance: b.readUInt32LE(p)};
        }
    },
    light: {
        id: 0x11,
        size: 1,
        parser: (b, p) => {
            return {light: b.readUInt8(p)};
        }
    },
    count: {
        id: 0x0F,
        size: 1,
        parser: (b, p) => {
            return {count: b.readUInt8(p)};
        }
    },
};

class Parser {

    constructor(buffer) {
        this.baseByteLength = 2;
        this.minLength      = 11;
        if (buffer == null) {
            throw new Error("A buffer must be provided.");
        }
        this.buffer = buffer;
        this.result = {};
        if (buffer.length < this.minLength) {
            throw new Error(
                `Service data length must be >= ${this.minLength} bytes. ${this.toString()}`
            );
        }
    }

    parse() {
        const msgLength         = this.buffer.length;
        this.productId          = this.parseProductId();
        this.result.productName = ProductName[this.productId] || null;
        // this.macAddress  = this.parseMacAddress();

        let dataPoint = 10;
        if ((this.buffer.readUInt8(0) & 0x3f) === 0x08) {

            while (dataPoint < msgLength) {
                let dataId   = this.buffer.readInt8(dataPoint - 2);
                let dataSize = this.buffer.readInt8(dataPoint - 1);
                if (dataPoint + dataSize <= msgLength) {
                    let parsed = false;
                    Object
                        .keys(EventTypes)
                        .forEach((type) => {
                            if (!parsed && EventTypes[type].id === dataId && EventTypes[type].size === dataSize) {
                                this.result = {...this.result, ...EventTypes[type].parser(this.buffer, dataPoint)};
                                parsed      = true;
                            }
                        })
                    if (!parsed)
                        this.result.raw[dataId] = this.buffer.slice(dataPoint, dataPoint + dataSize);

                }
                dataPoint = dataPoint + dataSize + 2
            }

        } else {
            this.result.raw = this.buffer;
        }
        return this.result;
    }

    parseProductId() {
        return this.buffer.readUInt8(1);
    }

    parseMacAddress() {
        const macBuffer = this.buffer.slice(
            this.baseByteLength,
            this.baseByteLength + 6
        );
        return Buffer.from(macBuffer)
            .reverse()
            .toString("hex");
    }

}

module.exports = {
    Parser,
    EventTypes
};
