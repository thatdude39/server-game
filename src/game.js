import crypto from 'node:crypto';

export const MAX_HP = 100;
export const ACTIONS = { ATTACK: 'attack', DEFEND: 'defend', SPECIAL: 'special' };

export function createGame({ challengerId, opponentId, rng = Math.random } = {}) {
  if (!challengerId) throw new Error('challengerId is required');
  if (!opponentId) throw new Error('opponentId is required');
  if (challengerId === opponentId) throw new Error('Players must be different');
  const firstTurn = rng() < 0.5 ? challengerId : opponentId;
  return {
    id: crypto.randomUUID(),
    status: 'active',
    challengerId,
    opponentId,
    turnId: firstTurn,
    round: 1,
    players: {
      [challengerId]: { id: challengerId, hp: MAX_HP, defending: false },
      [opponentId]: { id: opponentId, hp: MAX_HP, defending: false }
    },
    log: [`<@${firstTurn}> moves first.`],
    winnerId: null,
    loserId: null
  };
}

export function cloneGame(game) { return structuredClone(game); }

export function getOpponentId(game, playerId) {
  if (playerId === game.challengerId) return game.opponentId;
  if (playerId === game.opponentId) return game.challengerId;
  throw new Error('Player is not in this duel');
}

export function isParticipant(game, userId) {
  return userId === game.challengerId || userId === game.opponentId;
}

export function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function applyAction(game, playerId, action, { rng = Math.random } = {}) {
  const next = cloneGame(game);
  if (next.status !== 'active') throw new Error('This duel is already over');
  if (!isParticipant(next, playerId)) throw new Error('You are not in this duel');
  if (next.turnId !== playerId) throw new Error('It is not your turn');
  if (!Object.values(ACTIONS).includes(action)) throw new Error('Unknown action');

  const opponentId = getOpponentId(next, playerId);
  const player = next.players[playerId];
  const opponent = next.players[opponentId];
  const log = [];

  if (action === ACTIONS.DEFEND) {
    player.defending = true;
    log.push(`<@${playerId}> braces for impact and will reduce the next hit.`);
  }

  if (action === ACTIONS.ATTACK) {
    let damage = randomInt(rng, 12, 22);
    if (opponent.defending) {
      damage = Math.ceil(damage / 2);
      opponent.defending = false;
      log.push(`<@${opponentId}> blocks part of the attack.`);
    }
    opponent.hp = Math.max(0, opponent.hp - damage);
    log.push(`<@${playerId}> attacks <@${opponentId}> for **${damage}** damage.`);
  }

  if (action === ACTIONS.SPECIAL) {
    const missed = rng() < 0.3;
    if (missed) {
      log.push(`<@${playerId}> fires off a special move... and whiffs completely.`);
    } else {
      let damage = randomInt(rng, 25, 40);
      if (opponent.defending) {
        damage = Math.ceil(damage / 2);
        opponent.defending = false;
        log.push(`<@${opponentId}> blocks part of the special.`);
      }
      opponent.hp = Math.max(0, opponent.hp - damage);
      log.push(`<@${playerId}> lands a SPECIAL on <@${opponentId}> for **${damage}** damage.`);
    }
  }

  if (opponent.hp <= 0) {
    next.status = 'finished';
    next.winnerId = playerId;
    next.loserId = opponentId;
    next.turnId = null;
    log.push(`🏆 <@${playerId}> wins the duel.`);
  } else {
    next.turnId = opponentId;
    next.round += 1;
  }

  next.log = log.slice(-5);
  return next;
}

export function getHealthBar(hp, max = MAX_HP) {
  const total = 10;
  const filled = Math.round((hp / max) * total);
  return '█'.repeat(filled) + '░'.repeat(total - filled);
}

export function summarizeGame(game) {
  const challenger = game.players[game.challengerId];
  const opponent = game.players[game.opponentId];
  return {
    title: game.status === 'finished' ? 'Duel Finished' : `Round ${game.round}`,
    challengerLine: `<@${game.challengerId}> — ${challenger.hp}/${MAX_HP} HP ${getHealthBar(challenger.hp)}`,
    opponentLine: `<@${game.opponentId}> — ${opponent.hp}/${MAX_HP} HP ${getHealthBar(opponent.hp)}`,
    turnLine: game.status === 'active' ? `Turn: <@${game.turnId}>` : `Winner: <@${game.winnerId}>`,
    log: game.log.join('\n')
  };
}
