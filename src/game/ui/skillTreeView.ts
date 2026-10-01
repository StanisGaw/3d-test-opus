import {
  BRANCHES,
  type PlayerStats,
  SKILLS,
  SKILL_BY_ID,
  type SkillDef,
  type SkillId,
  type SkillInfo,
  type SkillStatus,
  type SkillTree,
  describeSkill,
  statLines,
} from '../systems/skillTree.ts';

const TOOLTIP_ID = 'st-tooltip';
const TOOLTIP_GAP = 10;

const STATUS_TEXT: Record<SkillStatus, string> = {
  learn: 'Click to learn (1 point)',
  noPoints: 'No skill points. Level up to earn one.',
  locked: 'Locked. Learn the required skill first.',
  maxed: 'Fully learned',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

interface NodeView {
  readonly def: SkillDef;
  readonly button: HTMLButtonElement;
  readonly pips: HTMLElement;
  readonly now: HTMLElement;
  readonly next: HTMLElement;
}

/** Modal skill tree: four branches of skills bought with points earned on level-up. */
export class SkillTreeView {
  private readonly root: HTMLElement;
  private readonly points: HTMLElement;
  private readonly stats: HTMLElement;
  private readonly nodes: NodeView[] = [];
  private readonly closeButton: HTMLButtonElement;
  private readonly tooltip: HTMLElement;
  private tree: SkillTree | null = null;
  private hovered: NodeView | null = null;

  constructor(parent: HTMLElement, onBuy: (id: SkillId) => void, onClose: () => void) {
    this.root = el('div', 'skill-tree hidden', parent);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'skill-tree-title');

    const header = el('header', 'st-header', this.root);
    const title = el('h2', 'st-title', header, 'Skill tree');
    title.id = 'skill-tree-title';
    this.points = el('div', 'st-points', header);
    this.points.setAttribute('aria-live', 'polite');
    this.closeButton = el('button', 'st-close', header, 'Resume [TAB]');
    this.closeButton.type = 'button';
    this.closeButton.addEventListener('click', onClose);

    const branches = el('div', 'st-branches', this.root);
    for (const branch of BRANCHES) {
      const section = el('section', `st-branch st-${branch.id}`, branches);
      section.setAttribute('aria-label', branch.name);
      el('h3', 'st-branch-name', section, branch.name);
      el('div', 'st-branch-tag', section, branch.tagline);
      const skills = SKILLS.filter((s) => s.branch === branch.id);
      const tiers = Math.max(...skills.map((s) => s.tier)) + 1;
      for (let tier = 0; tier < tiers; tier++) {
        if (tier > 0) el('div', 'st-link', section, '▼');
        const row = el('div', 'st-tier', section);
        for (const def of skills.filter((s) => s.tier === tier)) this.nodes.push(this.createNode(row, def, onBuy));
      }
    }
    this.stats = el('footer', 'st-stats', this.root);
    this.tooltip = el('div', 'st-tooltip hidden', this.root);
    this.tooltip.id = TOOLTIP_ID;
    this.tooltip.setAttribute('role', 'tooltip');
  }

  private createNode(row: HTMLElement, def: SkillDef, onBuy: (id: SkillId) => void): NodeView {
    const button = el('button', 'st-node', row);
    button.type = 'button';
    el('div', 'st-name', button, def.name);
    const pips = el('div', 'st-pips', button);
    const now = el('div', 'st-now', button);
    const next = el('div', 'st-next', button);
    const view: NodeView = { def, button, pips, now, next };
    button.addEventListener('click', () => onBuy(def.id));
    button.addEventListener('mouseenter', () => this.showTooltip(view));
    button.addEventListener('focus', () => this.showTooltip(view));
    button.addEventListener('mouseleave', () => this.hideTooltip(view));
    button.addEventListener('blur', () => this.hideTooltip(view));
    return view;
  }

  private showTooltip(node: NodeView): void {
    if (!this.tree) return;
    this.hovered?.button.removeAttribute('aria-describedby');
    this.hovered = node;
    node.button.setAttribute('aria-describedby', TOOLTIP_ID);
    this.fillTooltip(describeSkill(this.tree, node.def.id), node.def.branch);
    this.tooltip.classList.remove('hidden');
    this.placeTooltip(node.button);
  }

  private hideTooltip(node?: NodeView): void {
    if (node && this.hovered !== node) return;
    this.hovered?.button.removeAttribute('aria-describedby');
    this.hovered = null;
    this.tooltip.classList.add('hidden');
  }

  private fillTooltip(info: SkillInfo, branch: string): void {
    const t = this.tooltip;
    t.className = `st-tooltip st-${branch} status-${info.status}`;
    t.replaceChildren();
    const head = el('div', 'stt-head', t);
    el('div', 'stt-name', head, info.name);
    el('div', 'stt-meta', head, `${info.branch} · Rank ${info.rank}/${info.maxRank}`);
    el('p', 'stt-details', t, info.details);

    const list = el('ol', 'stt-ranks', t);
    for (const r of info.ranks) {
      const item = el('li', `stt-rank${r.owned ? ' owned' : ''}${r.next ? ' next' : ''}`, list);
      el('span', 'stt-rank-no', item, r.owned ? '■' : r.next ? '▶' : '□');
      el('span', 'stt-rank-text', item, r.text);
    }

    if (info.requires) {
      const req = info.requires;
      el('div', `stt-line stt-req${req.met ? ' met' : ''}`, t, `Requires: ${req.name} rank ${req.rank} ${req.met ? '✓' : '✗'}`);
    }
    if (info.unlocks.length > 0) el('div', 'stt-line stt-unlocks', t, `Unlocks: ${info.unlocks.join(', ')}`);
    if (info.tip) el('div', 'stt-line stt-tip', t, `Tip: ${info.tip}`);
    el('div', 'stt-status', t, STATUS_TEXT[info.status]);
  }

  /** Puts the tooltip beside the node: right if it fits, otherwise left, kept inside the window. */
  private placeTooltip(anchor: HTMLElement): void {
    const a = anchor.getBoundingClientRect();
    const t = this.tooltip.getBoundingClientRect();
    const maxX = window.innerWidth - t.width - 8;
    const maxY = window.innerHeight - t.height - 8;
    let x = a.right + TOOLTIP_GAP;
    if (x > maxX) x = a.left - t.width - TOOLTIP_GAP;
    x = Math.max(8, Math.min(maxX, x));
    const y = Math.max(8, Math.min(maxY, a.top + a.height / 2 - t.height / 2));
    this.tooltip.style.left = `${Math.round(x)}px`;
    this.tooltip.style.top = `${Math.round(y)}px`;
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(tree: SkillTree, level: number, stats: PlayerStats): void {
    this.root.classList.remove('hidden');
    this.render(tree, level, stats);
    this.closeButton.focus();
  }

  close(): void {
    this.hideTooltip();
    this.root.classList.add('hidden');
  }

  /** Short shake on a node the player could not buy. */
  reject(id: SkillId): void {
    const node = this.nodes.find((n) => n.def.id === id);
    if (!node) return;
    node.button.classList.remove('shake');
    void node.button.offsetWidth;
    node.button.classList.add('shake');
  }

  render(tree: SkillTree, level: number, stats: PlayerStats): void {
    this.tree = tree;
    this.points.textContent = `Level ${level} · ${tree.points} ${tree.points === 1 ? 'point' : 'points'} to spend`;
    this.points.classList.toggle('has-points', tree.points > 0);
    for (const n of this.nodes) {
      const rank = tree.rank(n.def.id);
      const state = tree.check(n.def.id);
      n.button.classList.toggle('maxed', state === 'maxed');
      n.button.classList.toggle('locked', state === 'locked');
      n.button.classList.toggle('available', state === 'ok');
      n.button.classList.toggle('owned', rank > 0);
      n.button.setAttribute('aria-disabled', String(state !== 'ok'));
      n.pips.textContent = '■'.repeat(rank) + '□'.repeat(n.def.maxRank - rank);
      n.now.textContent = rank > 0 ? n.def.effect(rank) : '';
      if (state === 'locked' && n.def.requires) {
        const req = SKILL_BY_ID[n.def.requires.id];
        n.next.textContent = `Needs ${req.name} ${n.def.requires.rank}`;
      } else {
        n.next.textContent = state === 'maxed' ? 'MAX' : `Next: ${n.def.effect(rank + 1)}`;
      }
      n.button.setAttribute('aria-label', `${n.def.name}, rank ${rank} of ${n.def.maxRank}. ${n.next.textContent}`);
    }
    this.stats.replaceChildren(
      ...statLines(stats).map((line) => {
        const cell = el('div', `st-stat${line.boosted ? ' boosted' : ''}`);
        el('div', 'st-stat-label', cell, line.label);
        el('div', 'st-stat-value', cell, line.value);
        return cell;
      }),
    );
    // Buying a rank changes the tooltip text, so refresh it in place.
    if (this.hovered) this.showTooltip(this.hovered);
  }
}
