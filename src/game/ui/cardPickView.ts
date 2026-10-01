import { PERK_BY_ID, type PerkDeck, type PerkId, type Rarity } from '../systems/perks.ts';

const RARITY_LABEL: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

/** Modal "pick 1 of 3" reward shown after every boss. The game waits until a card is chosen. */
export class CardPickView {
  private readonly root: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly cards: HTMLElement;
  private readonly owned: HTMLElement;
  private offer: PerkId[] = [];
  private readonly onPick: (id: PerkId) => void;

  constructor(parent: HTMLElement, onPick: (id: PerkId) => void) {
    this.onPick = onPick;
    this.root = el('div', 'card-pick hidden', parent);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'card-pick-title');
    const title = el('h2', 'cp-title', this.root, 'Choose a reward');
    title.id = 'card-pick-title';
    this.subtitle = el('div', 'cp-subtitle', this.root);
    this.cards = el('div', 'cp-cards', this.root);
    this.owned = el('div', 'cp-owned', this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(offer: PerkId[], deck: PerkDeck, round: number): void {
    this.offer = offer;
    this.subtitle.textContent = `Round ${round} cleared! Pick one card. It lasts for the whole run. [1-${offer.length}]`;
    this.cards.replaceChildren(
      ...offer.map((id, i) => {
        const def = PERK_BY_ID[id];
        const card = el('button', `cp-card cp-${def.rarity}`);
        card.type = 'button';
        el('div', 'cp-key', card, String(i + 1));
        el('div', 'cp-rarity', card, RARITY_LABEL[def.rarity]);
        el('div', 'cp-name', card, def.name);
        el('div', 'cp-text', card, def.text);
        const have = deck.count(id);
        const limit = Number.isFinite(def.maxStacks) ? `/${def.maxStacks}` : '';
        el('div', 'cp-stacks', card, have > 0 ? `Owned ${have}${limit}` : 'New');
        card.setAttribute('aria-label', `${def.name}, ${RARITY_LABEL[def.rarity]}: ${def.text}. Key ${i + 1}.`);
        card.addEventListener('click', () => this.onPick(id));
        return card;
      }),
    );
    const list = [...deck.owned].filter(([, n]) => n > 0).map(([id, n]) => (n > 1 ? `${PERK_BY_ID[id].name} x${n}` : PERK_BY_ID[id].name));
    this.owned.textContent = list.length > 0 ? `Your cards: ${list.join(', ')}` : 'No cards yet';
    this.root.classList.remove('hidden');
    (this.cards.firstElementChild as HTMLElement | null)?.focus();
  }

  /** Picks the card under keyboard slot `index` (0-based). */
  pickSlot(index: number): void {
    const id = this.offer[index];
    if (id) this.onPick(id);
  }

  close(): void {
    this.root.classList.add('hidden');
    this.offer = [];
  }
}
