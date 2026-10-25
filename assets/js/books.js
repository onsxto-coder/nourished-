// Sixto's books featured inside nourished.

import { h } from './ui.js';

export const LOW_CARB_BOOK = {
  title: 'Ultimate Low Carb Cookbook',
  url: 'https://www.amazon.com/dp/B0DQJDNT7M',
  cover: 'https://i0.wp.com/sixtocarreon.com/wp-content/uploads/2026/10/ultimate-low-carb-cookbook-sixto-carreon-cover.jpeg?fit=240%2C286&ssl=1',
};

/** A small card for the low-carb cookbook. */
export function lowCarbBookCard(lead = 'Going low carb?') {
  const b = LOW_CARB_BOOK;
  return h('aside', { class: 'book-card', 'aria-label': b.title },
    h('img', { src: b.cover, alt: `${b.title} by Sixto Carreon, book cover`, width: 76, height: 90, loading: 'lazy', decoding: 'async' }),
    h('div', {},
      h('p', { class: 'book-lead', text: lead }),
      h('h3', { text: b.title }),
      h('p', { text: 'My low-carb recipes and practical meal prep, to cook to these numbers.' }),
      h('a', { class: 'btn btn-secondary btn-sm', href: b.url, target: '_blank', rel: 'noopener' }, 'View on Amazon ↗')));
}
