import { getEdge, setEdge } from './relationships.js';

const MAX_INFLUENCE = 100;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function decrementCooldowns(cooldowns = {}) {
  return Object.fromEntries(
    Object.entries(cooldowns)
      .map(([action, turns]) => [action, Math.max(0, (turns ?? 0) - 1)])
      .filter(([, turns]) => turns > 0)
  );
}

function relationCheck(edge) {
  if (!edge) return { ok: false, reason: 'countries-are-not-neighbours' };
  return { ok: true };
}

export const ACTION_DEFINITIONS = Object.freeze({
  improveRelations: {
    type: 'improveRelations',
    cost: 6,
    cooldown: 2,
    priority: 2,
    check(state, actor, target) {
      const edge = getEdge(state.relations, actor, target);
      const link = relationCheck(edge);
      if (!link.ok) return link;
      if (edge.rel >= 85) return { ok: false, reason: 'relations-already-high' };
      return { ok: true };
    },
    apply(edge) {
      return {
        rel: edge.rel + 10,
        tension: edge.tension - 7,
        trust: edge.trust + 6,
        modifier: { rel: 1, tension: -1, trust: 1, turns: 2, text: 'Goodwill outreach' }
      };
    },
    score(edge) {
      return (70 - edge.rel) + edge.tension * 0.2;
    }
  },
  offerTradeDeal: {
    type: 'offerTradeDeal',
    cost: 8,
    cooldown: 3,
    priority: 1,
    check(state, actor, target) {
      const edge = getEdge(state.relations, actor, target);
      const link = relationCheck(edge);
      if (!link.ok) return link;
      if (edge.rel < -20) return { ok: false, reason: 'relations-too-poor-for-trade' };
      if (edge.tension > 75) return { ok: false, reason: 'tension-too-high-for-trade' };
      return { ok: true };
    },
    apply(edge) {
      return {
        rel: edge.rel + 14,
        tension: edge.tension - 10,
        trust: edge.trust + 8,
        modifier: { rel: 2, tension: -1, trust: 1, turns: 3, text: 'Trade pact momentum' }
      };
    },
    score(edge) {
      return edge.rel + (100 - edge.tension) * 0.4 + edge.trust * 0.3;
    }
  },
  threaten: {
    type: 'threaten',
    cost: 7,
    cooldown: 2,
    priority: 3,
    check(state, actor, target) {
      const edge = getEdge(state.relations, actor, target);
      const link = relationCheck(edge);
      if (!link.ok) return link;
      const actorPower = state.dynamic?.[actor]?.power ?? 0;
      const targetPower = state.dynamic?.[target]?.power ?? 0;
      if (actorPower < targetPower * 0.9) return { ok: false, reason: 'insufficient-power-to-threaten' };
      return { ok: true };
    },
    apply(edge) {
      return {
        rel: edge.rel - 12,
        tension: edge.tension + 14,
        trust: edge.trust - 10,
        modifier: { rel: -1, tension: 2, trust: -1, turns: 2, text: 'Threat posture' }
      };
    },
    score(edge) {
      return (50 - edge.rel) + edge.tension;
    }
  },
  guarantee: {
    type: 'guarantee',
    cost: 10,
    cooldown: 4,
    priority: 0,
    check(state, actor, target) {
      const edge = getEdge(state.relations, actor, target);
      const link = relationCheck(edge);
      if (!link.ok) return link;
      if (edge.rel < 20) return { ok: false, reason: 'relations-too-low-to-guarantee' };
      if (edge.trust < 35) return { ok: false, reason: 'trust-too-low-to-guarantee' };
      return { ok: true };
    },
    apply(edge) {
      return {
        rel: edge.rel + 8,
        tension: edge.tension - 8,
        trust: edge.trust + 12,
        modifier: { rel: 1, tension: -2, trust: 2, turns: 4, text: 'Security guarantee pact' }
      };
    },
    score(edge) {
      return edge.rel * 0.7 + edge.trust - edge.tension * 0.5;
    }
  },
  sanction: {
    type: 'sanction',
    cost: 9,
    cooldown: 3,
    priority: 4,
    check(state, actor, target) {
      const edge = getEdge(state.relations, actor, target);
      const link = relationCheck(edge);
      if (!link.ok) return link;
      if (edge.rel > 35) return { ok: false, reason: 'relations-not-bad-enough-for-sanctions' };
      return { ok: true };
    },
    apply(edge) {
      return {
        rel: edge.rel - 15,
        tension: edge.tension + 9,
        trust: edge.trust - 12,
        modifier: { rel: -2, tension: 1, trust: -1, turns: 3, text: 'Sanctions regime' }
      };
    },
    score(edge) {
      return (0 - edge.rel) + edge.tension * 0.6;
    }
  }
});

export function checkActionPreconditions(state, action) {
  if (!action?.actor || !action?.target || !action?.type) return { ok: false, reason: 'malformed-action' };
  if (action.actor === action.target) return { ok: false, reason: 'self-targeting-not-allowed' };
  const actorEntry = state.dynamic?.[action.actor];
  const targetEntry = state.dynamic?.[action.target];
  if (!actorEntry) return { ok: false, reason: 'unknown-actor-country' };
  if (!targetEntry) return { ok: false, reason: 'unknown-target-country' };

  const def = ACTION_DEFINITIONS[action.type];
  if (!def) return { ok: false, reason: 'unknown-action-type' };
  if (actorEntry.actionUsedTurn === state.turn) return { ok: false, reason: 'actor-already-used-action-this-turn' };
  if ((actorEntry.cooldowns?.[action.type] ?? 0) > 0) return { ok: false, reason: 'action-on-cooldown' };
  if ((actorEntry.influence ?? 0) < def.cost) return { ok: false, reason: 'insufficient-influence' };

  return def.check(state, action.actor, action.target);
}

function stableActionSort(a, b) {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.actor !== b.actor) return a.actor.localeCompare(b.actor);
  if (a.target !== b.target) return a.target.localeCompare(b.target);
  return a.type.localeCompare(b.type);
}

function getQueuedPlayerAction(state) {
  return state.queuedPlayerAction ?? state.playerQueuedAction ?? state.queuedAction ?? null;
}

function getActionCandidatesForActor(state, actor) {
  const relationTargets = Object.keys(state.relations?.[actor] ?? {}).filter((target) => target !== actor).sort();
  const candidates = [];

  for (const target of relationTargets) {
    const edge = getEdge(state.relations, actor, target);
    if (!edge) continue;
    for (const [type, def] of Object.entries(ACTION_DEFINITIONS)) {
      const candidate = { actor, target, type, source: 'ai', priority: def.priority };
      const check = checkActionPreconditions(state, candidate);
      if (!check.ok) continue;
      candidates.push({ ...candidate, score: def.score(edge) });
    }
  }

  candidates.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.target !== b.target) return a.target.localeCompare(b.target);
    return a.type.localeCompare(b.type);
  });

  return candidates;
}

export function planActions(state) {
  const plannedActions = [];
  const queued = getQueuedPlayerAction(state);

  if (queued) {
    const def = ACTION_DEFINITIONS[queued.type];
    plannedActions.push({
      actor: queued.actor,
      target: queued.target,
      type: queued.type,
      source: 'player',
      priority: def?.priority ?? Number.MAX_SAFE_INTEGER
    });
  }

  const blockedActors = new Set(plannedActions.map((item) => item.actor));
  const actorCodes = Object.keys(state.dynamic ?? {}).sort();
  for (const actor of actorCodes) {
    if (blockedActors.has(actor)) continue;
    const candidates = getActionCandidatesForActor(state, actor);
    if (!candidates.length) continue;
    plannedActions.push(candidates[0]);
  }

  return plannedActions.map(({ score, ...action }) => action);
}

export function applyPlannedActions(state, plannedActions = []) {
  const nextDynamic = {};
  for (const [cca3, entry] of Object.entries(state.dynamic ?? {})) {
    nextDynamic[cca3] = {
      ...entry,
      cooldowns: decrementCooldowns(entry.cooldowns)
    };
  }

  const nextRelations = {};
  for (const [a, neighbours] of Object.entries(state.relations ?? {})) {
    if (!nextRelations[a]) nextRelations[a] = {};
    for (const [b, edge] of Object.entries(neighbours ?? {})) {
      nextRelations[a][b] = {
        ...edge,
        modifiers: [...(edge.modifiers ?? [])]
      };
    }
  }

  const actionEvents = [];
  const sorted = [...plannedActions].sort(stableActionSort);

  for (const action of sorted) {
    const check = checkActionPreconditions({ ...state, dynamic: nextDynamic, relations: nextRelations }, action);
    if (!check.ok) {
      actionEvents.push({ turn: state.turn, cca3: action.actor, secondary: action.target, text: `Action failed (${action.type}): ${check.reason}` });
      continue;
    }

    const def = ACTION_DEFINITIONS[action.type];
    const edge = getEdge(nextRelations, action.actor, action.target);
    const effect = def.apply(edge, action);
    const updatedEdge = {
      ...edge,
      rel: clamp(effect.rel, -100, 100),
      tension: clamp(effect.tension, 0, 100),
      trust: clamp(effect.trust, 0, 100),
      lastTurnUpdated: state.turn,
      modifiers: [...(edge.modifiers ?? []), effect.modifier].filter((mod) => (mod?.turns ?? 0) > 0)
    };

    setEdge(nextRelations, action.actor, action.target, updatedEdge);

    const actorEntry = nextDynamic[action.actor];
    actorEntry.influence = clamp((actorEntry.influence ?? 0) - def.cost, 0, MAX_INFLUENCE);
    actorEntry.actionUsedTurn = state.turn;
    actorEntry.cooldowns = {
      ...actorEntry.cooldowns,
      [action.type]: def.cooldown
    };

    actionEvents.push({
      turn: state.turn,
      cca3: action.actor,
      secondary: action.target,
      text: `${action.source === 'player' ? 'Player' : 'AI'} ${action.type}`
    });
  }

  return {
    dynamic: nextDynamic,
    relations: nextRelations,
    events: actionEvents
  };
}
