import sprite from '../public/feather-sprite.svg';
console.debug('icon sprite', sprite);

export default function icon(name) {
    if (!name) return console.error('Need to pass an icon name');
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add('feather', 'feather-icon');
    svg.innerHTML = `<use xlink:href="${sprite}#${name}"/>`;
    return svg;
}