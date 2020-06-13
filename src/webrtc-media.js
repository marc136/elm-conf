export default class WebRtcMedia extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    console.log('WebRtcMedia connected')
    // attach a shadow root so nobody can mess with your styles
    // const shadow = this.attachShadow({ mode: "open" });

    const video = document.createElement("video");
    video.muted = true;
    // will be blocked on some browsers if our stream contains audio and video and it is not muted
    video.autoplay = true;
    // https://css-tricks.com/what-does-playsinline-mean-in-web-video/
    video.setAttribute("playsinline", true);
    this.appendChild(video);

    this.videoElement = video;
    video.classList.remove('hidden');
    const audio = document.createElement('audio');
    audio.autoplay = true;
    this.audioElement = audio;

    video.controls = true; // TODO remove
    audio.controls = true; // TODO remove

    this.appendChild(this.audioElement);
    this._addPeerConnectionEventListeners();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    console.error(`attributeChanged "${name}"`, { oldValue, newValue });
  }

  static get observedAttributes() {
    return ['has-media', 'has-video', 'has-audio'];
  }

  _addPeerConnectionEventListeners() {
    this.pc.ontrack = ({ track, streams }) => {
      console.log(`ontrack for ${this.id}`, track, this);
      this._playTrack(track);
    };
  }

  _playTrack(track) {
    const el = this[track.kind + 'Element'];
    if (!el) {
      console.error(`could not play ${track.kind} track because media element was not found`, track);
    }
    this.setAttribute('has-' + track.kind, true);

    console.warn('_playTrack', this.id, track);
    track.onunmute = () => {
      console.log(`track.onunmute for ${this.id}`, track);
      el.srcObject = new MediaStream([track]);
    };
    if (adapter.browserDetails.browser === 'safari') {
      console.log(`${track.kind} ${this.id} srcObject was set directly because safari does not trigger track.onunmute`);
      el.srcObject = new MediaStream([track]);
    }
  }
}
customElements.define('webrtc-media', WebRtcMedia);
