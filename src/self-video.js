export default class SelfVideo extends HTMLElement {
    constructor() {
        super();
        console.debug('self-video constructed');
        this.video = document.createElement('video');
        this.video.muted = true;
        this.video.autoplay = true;
    }

    connectedCallback() {
        console.debug('self-video connected');
        this.video.srcObject = this.src;
        this.appendChild(this.video);
    }
}
customElements.define('self-video', SelfVideo);
