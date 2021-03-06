// alternative: express-ws https://stackoverflow.com/a/32705838/3256574
const uWS = require('uWebSockets.js');
const port = 8443;

const startTime = Date.now()

function ts() { return new Date().toISOString() }

class Room {
    constructor(id) {
        this.users = new Map();
        this.id = id;
        this.digest = {} // contains import room data
    }

    userInfo(userId) {
        const user = this.users.get(userId);
        if (user) return user.public;
    }
}

const room = new Room('123123')


let userCount = 0;

const app = uWS./*SSL*/App({
    // key_file_name: 'misc/key.pem',
    // cert_file_name: 'misc/cert.pem',
    // passphrase: '1234'
}).ws('/join/:roomId', {
    /* Options */
    compression: 0,
    maxPayloadLength: 16 * 1024 * 1024,
    idleTimeout: 0, // allow user to keep connection open indefinitely
    /* Handlers */
    open: (ws, req) => {
        console.log('A WebSocket connected via URL: ' + req.getUrl() + '!');
        const roomId = req.getParameter(0);
        console.log({ roomId });
        if (room.id != roomId) {
            console.warn(ts(), 'Rejected user for room', roomId);
            ws.send(JSON.stringify({ type: 'join-rejected', message: 'Invalid room' }));
            ws.end(4000, 'rejected');
        } else {
            const userId = userCount;
            userCount++;

            // store new user
            ws.roomId = roomId;
            ws.roomChannel = `room/${roomId}`;

            ws.public = {
                userId,
                supportsWebRtc: false,
                browser: 'unknown',
                browserVersion: 0
            };
            const users = Array.from(room.users.values()).map(u => u.public);


            // send initialization message to new user
            console.log(ts(), `Added user to room ${roomId}`, ws);
            const data = { type: 'join-success', userId, roomId, users };
            ws.send(JSON.stringify(data), false);
            ws.subscribe(ws.roomChannel);
        }
    },
    message: (ws, message, isBinary) => {
        if (!isBinary) {
            let str = Buffer.from(message).toString('utf8');
            try {
                const msg = JSON.parse(str);
                console.log(ts(), `User ${ws.public.userId} sent`, msg);

                switch (msg.type) {
                    case 'initial':
                        const user = ws.public;
                        user.supportsWebRtc = msg.supportsWebRtc || false;
                        user.browser = msg.browser || '';
                        user.browserVersion = msg.browserVersion || 0;
                        room.users.set(user.userId, ws);

                        app.publish(ws.roomChannel, JSON.stringify({ type: 'user', user }));
                        break;

                    case 'offer':
                    case 'answer':
                    case 'ice-candidate':
                        let dest = room.users.get(msg.for);
                        if (dest) {
                            delete msg.for
                            msg.from = ws.public.userId;
                            sendJson(dest, msg);
                        }
                        break;

                    default:
                        console.log(ts(), `Cannot handle message from user ${ws.public.userId}`, msg);
                }

            } catch (error) {
                console.warn(ts(), 'error', error);
                console.warn(ts(), `Could not JSON.parse message '${str}'`);
            }
        } else {
            /* Ok is false if backpressure was built up, wait for drain */
            let ok = ws.send(message, isBinary);
        }
    },
    drain: (ws) => {
        console.log(ts(), 'WebSocket backpressure: ' + ws.getBufferedAmount());
    },
    close: (ws, code, message) => {
        console.log(ts(), 'WebSocket closed', ws, { code, message: Buffer.from(message).toString('utf8') });

        if (ws.public) {
            room.users.delete(ws.public.userId);
            const leave = { type: 'leave', user: ws.public.userId };
            app.publish(ws.roomChannel, JSON.stringify(leave));
        }
    }
}).any('/alive', (res, req) => {
    const now = Date.now();
    const uptimeInHours = Math.floor((now - startTime) / 3_600_000);
    const uptimeInDays = Math.floor(uptimeInHours / 24);
    const alive = { start: startTime, now, uptimeInHours, uptimeInDays };
    res.writeStatus('200 OK');
    res.writeHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(alive));
}).any('/*', (res, req) => {
    res.end('Nothing to see here!');
}).listen(port, (token) => {
    if (token) {
        console.log(ts(), 'Listening to port ' + port);
    } else {
        console.log(ts(), 'Failed to listen to port ' + port);
    }
});

/**
 *
 * @param {WebSocket} ws
 * @param {object} json
 */
function sendJson(ws, json) {
    return ws.send(JSON.stringify(json));
}
