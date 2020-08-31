import './main.css';
import { Elm } from './Main.elm';
import * as serviceWorker from './serviceWorker';

// import custom elements
import './camera-select.js';
import './webrtc-media.js';
import './self-video.js';

const webRtcSupport = {
  peerConnection: !!window.RTCPeerConnection,
  getUserMedia: navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function'
};
const supportsWebRtc = webRtcSupport.peerConnection && webRtcSupport.getUserMedia || false;

const wsServer = process.env.ELM_APP_WS_SERVER || `wss://${location.hostname}:${location.port}`;
console.log('WebSocket server address: ', wsServer);

// TODO remove state.ws
const state = {
  ws: undefined // TODO remove this
};

const elm = Elm.Main.init({
  node: document.getElementById('root'),
  flags: {
    supportsWebRtc,
    browser: adapter.browserDetails.browser,
    browserVersion: adapter.browserDetails.version
  }
});

function toServer(json, ws) {
  // if (!ws) return console.error('FATAL ERROR: no websocket was given')
  state.ws.send(JSON.stringify(json));
}

function toElm(json) {
  console.debug('toElm', json);
  elm.ports.incoming.send(json);
}

elm.ports.logs.subscribe(({ level, message}) => {
  console[level](message);
});

elm.ports.out.subscribe(async msg => {
  console.debug('got from elm', msg);

  switch (msg.type) {
    case 'disconnect':
      // TODO remove state.ws
      state.ws.close(1000, "User left conference");
      break;

    case 'releaseUserMedia':
      stopStream(msg.stream);
      break;

    case 'join':
      // TODO remove state.ws
      state.ws = connectToRoom(msg.room);
      break;

    case 'createSdpOffer':
      initiateSdpOffer(msg.for, msg.pc, msg.localStream);
      break;

    case 'closeRemotePeerConnection':
      closePeerConnection(msg.pc);
      break;

    case 'createSdpAnswer':
      await receiveSdpOffer(msg.offer, msg.from, msg.pc, msg.localStream, msg.ws);
      if (Array.isArray(msg.iceCandidates)) {
        for (const candidate of msg.iceCandidates) {
          await addRemoteIceCandidate(msg.pc, candidate);
        }
      }
      break;

    case 'setRemoteSdpAnswer':
      msg.pc.setRemoteDescription(msg.answer)
        .then(() => {
          console.log('Successfully set remote SDP answer', msg);
        })
        .catch(ex => {
          console.error('could not set remote SDP answer', ex, msg);
        })
      break;

    case 'setRemoteIceCandidate':
      addRemoteIceCandidate(msg.pc, msg.candidate);
      break;

    default:
      console.warn('Unsupported elm msg:', msg)
  }
})

function stopStream(stream) {
  if (stream && typeof stream.getTracks === 'function') {
    stream.getTracks().forEach(track => {
      track.stop();
    });
  }
}

/**
 * @param {number} peerId
 * @param {RTCPeerConnection} pc
 * @param {MediaStream} localStream
 */
async function initiateSdpOffer(peerId, pc, localStream) {
  pc.onicecandidate = propagateLocalIceCandidates(peerId);

  pc.onnegotiationneeded = async () => {
    try {
      console.debug("pc.onnegotiationneeded");
      await pc.setLocalDescription(await pc.createOffer());
      const data = { type: 'offer', for: peerId, sdp: pc.localDescription.sdp };
      toServer(data);
      data.pc = pc;
      toElm(data);
    } catch (err) {
      console.error('onnegotiationneeded failure', err);
    }
  };

  addLocalStream(pc, localStream);
}

/**
 * @param {RTCSessionDescription} sdp
 * @param {number} from
 * @param {RTCPeerConnection} pc
 * @param {MediaStream} localStream
 */
async function receiveSdpOffer(sdp, from, pc, localStream) {
  pc.onicecandidate = propagateLocalIceCandidates(from);

  await pc.setRemoteDescription(sdp);
  addLocalStream(pc, localStream);
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer);
  toElm({ type: 'answer', for: from, sdp: answer.sdp });
  toServer({ type: 'answer', for: from, sdp: answer.sdp });
}

/**
 * @param {number} peerId
 * @param {WebSocket} ws
 */
function propagateLocalIceCandidates(peerId, ws) {
  return ({ candidate }) => {
    console.debug(`Found local ICE candidate for peer ${peerId}`);
    const data = { type: 'ice-candidate', for: peerId, candidate };
    // toElm(data);
    toServer(data);
  };
}

/**
 * Adds all tracks of the stream to an RTCPeerConnection
 * @param {RTCPeerConnection} pc
 * @param {MediaStream} stream
 */
function addLocalStream(pc, stream) {
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }
}

/**
 * @param {RTCPeerConnection} pc
 * @param {RTCIceCandidate} candidate
 */
function addRemoteIceCandidate(pc, candidate) {
  return pc.addIceCandidate(candidate)
    .then(() => {
      console.debug('Successfully set remote ICE candidate', candidate);
    })
    .catch(ex => {
      console.error('Could not set remote ICE candidate', { pc, candidate, ex });
    })
}

function connectToRoom(roomId) {
  const address = `${wsServer}/join/${roomId}`;
  console.log('Will connect to', address);
  const ws = new WebSocket(address);
  ws.onopen = evt => {
    console.log('socket was opened');
    state.ws = ws;
    toServer({
      type: 'initial',
      supportsWebRtc,
      browser: adapter.browserDetails.browser,
      browserVersion: adapter.browserDetails.version
    });
  };

  ws.onmessage = async evt => {
    const msg = getMsg(evt.data);
    console.debug('got msg', msg);
    msg.socket = ws;
    toElm(msg);
  };

  ws.onclose = evt => {
    console.log('socket closed', evt);
  };

  return ws;
}

function getMsg(data) {
  try {
    const json = JSON.parse(data)
    return json
  } catch (error) {
    return data
  }
}

/**
 * @param {RTCPeerConnection} pc
 */
function closePeerConnection(pc) {
  pc.oniceconnectionstatechange = null;
  pc.onsignalingtatechange = null;
  pc.onconnectionstatechange = null;
  pc.close()
}

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
