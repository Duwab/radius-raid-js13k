$.RoomManager = function(url) {
    this.deviceId = localStorage.getItem("deviceId");
    this.roomId = localStorage.getItem("roomId");
    this.roomToken = localStorage.getItem("roomToken");
    this.socket = io(url);

    this.socket.once("connect", () => {
        this.socket.emit('hello from client', this.deviceId);
        this.init();
    });

    this.room = new $.Room({ id: this.roomId, token: this.roomToken });
    $.room = this.room;
    this.devices = {};

    this.socket.on('device-join', ({deviceId, ...remaining}) => {
        console.log('device-join', deviceId);
        joinDevice({deviceId, ...remaining});
    });
    const joinDevice = ({deviceId}) => {
        if (!this.devices[deviceId]) {
            this.devices[deviceId] = {
                id: deviceId,
                member: true,
                connected: true,
            };
            this.room.onDeviceJoin(deviceId);
        } else {
            const isNewMember = !this.devices[deviceId].member;
            const isReconnectionEvent = !isNewMember && !this.devices[deviceId].connected;
            this.devices[deviceId].member = true;
            this.devices[deviceId].connected = true;

            if (isNewMember) {
                this.room.onDeviceJoin(deviceId);
            } else if (isReconnectionEvent) {
                this.room.onDeviceReconnect(deviceId);
            }
        }
    }
    this.socket.on('device-leave', ({deviceId, ...remaining}) => {
        console.log('device-leave', deviceId);
        leaveDevice({deviceId, ...remaining});
    });
    const leaveDevice = ({deviceId}) => {
        if (!this.devices[deviceId]) return console.error('unregistered device', deviceId);

        this.devices[deviceId].member = false;
        this.room.onDeviceLeave(deviceId);

    }
    this.socket.on('device-disconnected', ({deviceId}) => {
        console.log('device-disconnected', deviceId);
        if (!this.devices[deviceId]) return;

        this.devices[deviceId].connected = false;
        this.room.onDeviceDisconnected(deviceId);
    });
    this.socket.on('devices', ({devices: newDeviceList}) => {
        for (let deviceMessage of newDeviceList) {
            joinDevice(deviceMessage);
        }

        for (let localDeviceId in this.devices) {
            if (!newDeviceList.find((deviceMessage) => deviceMessage.deviceId === localDeviceId)) {
                leaveDevice({deviceId: localDeviceId});
            }
        }
    });
    this.socket.on('control', ({
        id,
        action,
        angle,
        intensity,
        tags = [],
        deviceId,
        roomId,
        ...others
    }) => {
        // console.log('control', id, action, angle, intensity, tags, deviceId, roomId, others);
        const controlName = tags.includes('position') ? 'position' : 'shoot';
        this.room.onControl(deviceId, {
            action,
            angle,
            intensity,
            controlName,
        })
    });
}

$.RoomManager.prototype.init = async function() {
    await this.createDeviceIdIfNotExists();
    await this.createRoomIfNotExists();
    console.log('room created', this.roomId);

    const size = 200;
	const left = $.cw / 2 - size - 100 - 70;
	const top = $.ch / 2 - size / 2 + 50;
    const wrapperEl = document.getElementById("qrcode-wrapper");
    const qrEl = document.getElementById("qrcode");
    wrapperEl.style.top = `${top}px`;
    wrapperEl.style.left = `${left}px`;
    var qrcode = new QRCode(qrEl, {
        text: `https://game.test.duwab.com?room=${this.roomId}`,
        width: size,
        height: size,
        colorDark : "#000000",
        colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });
    this.socket.emit('join-room', { roomId: this.roomId, token: this.roomToken });

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            this.socket.off('join-room-ack');
            console.error('failed joining', this.roomId);
            reject();
        }, 5000);
        this.socket.once('join-room-ack', () => {
            clearTimeout(timeout);
            console.log('successfully joined', this.roomId);
            resolve();
        });
    })
}

$.RoomManager.prototype.createDeviceIdIfNotExists = async function() {
    if (!this.deviceId) {
        this.deviceId = `raid-${Math.round(Math.random() * 100000000)}`;
        localStorage.setItem("deviceId", this.deviceId);
    }
}

$.RoomManager.prototype.createRoomIfNotExists = async function() {
    if (!this.roomId || !this.roomToken) {
        const { id, token } = await this.createRoom();
        this.roomId = id;
        this.roomToken = token;
        this.room = new $.Room({ id, token });
        $.room = this.room;
        localStorage.setItem("roomId", id);
        localStorage.setItem("roomToken", token);
        console.log('created room', this.roomId);
    }
}

$.RoomManager.prototype.createRoom = async function() {
    if (this.room && this.room.id) throw new Error('won\'t create romm if one already exists');

    const { data } = await axios.post(`${BASE_URL}/api/room`);

    return data;
}
