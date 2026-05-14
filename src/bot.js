import 'dotenv/config';
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  Client, EmbedBuilder, Events, GatewayIntentBits, SlashCommandBuilder
} from 'discord.js';
import { ACTIONS, applyAction, createGame, summarizeGame } from './game.js';

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;
if (!token) {
  console.error('Missing DISCORD_TOKEN');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const pendingChallenges = new Map();
const activeGames = new Map();

const duelCommand = new SlashCommandBuilder()
  .setName('duel')
  .setDescription('Challenge another user to a button duel.')
  .addUserOption(o => o.setName('user').setDescription('Who to duel').setRequired(true));

function challengeEmbed({ challengerId, opponentId }) {
  return new EmbedBuilder()
    .setTitle('⚔️ Duel Challenge')
    .setDescription(`<@${challengerId}> challenged <@${opponentId}> to a duel.`)
    .addFields({ name: 'How it works', value: '**Attack** — 12-22 dmg\n**Defend** — halves next hit\n**Special** — 25-40 dmg, 30% miss' })
    .setColor(0xff3355);
}

function challengeButtons(challengeId) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`challenge:${challengeId}:accept`).setLabel('Accept').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`challenge:${challengeId}:decline`).setLabel('Decline').setStyle(ButtonStyle.Danger)
  )];
}

function gameEmbed(game) {
  const s = summarizeGame(game);
  return new EmbedBuilder()
    .setTitle(`⚔️ ${s.title}`)
    .setDescription([s.challengerLine, s.opponentLine, '', s.turnLine].join('\n'))
    .addFields({ name: 'Last move', value: s.log || 'The duel begins.' })
    .setColor(game.status === 'finished' ? 0xfacc15 : 0x5865f2);
}

function gameButtons(game) {
  if (game.status === 'finished') {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`duel:${game.id}:rematch`).setLabel('Run it back').setStyle(ButtonStyle.Primary)
    )];
  }
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`duel:${game.id}:${ACTIONS.ATTACK}`).setLabel('Attack').setEmoji('🗡️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`duel:${game.id}:${ACTIONS.DEFEND}`).setLabel('Defend').setEmoji('🛡️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`duel:${game.id}:${ACTIONS.SPECIAL}`).setLabel('Special').setEmoji('✨').setStyle(ButtonStyle.Primary)
  )];
}

async function reject(interaction, message) {
  if (interaction.replied || interaction.deferred) return interaction.followUp({ content: message, ephemeral: true });
  return interaction.reply({ content: message, ephemeral: true });
}

client.once(Events.ClientReady, async rc => {
  console.log(`Online as ${rc.user.tag}`);
  const payload = [duelCommand.toJSON()];
  if (guildId) {
    const guild = await rc.guilds.fetch(guildId);
    await guild.commands.set(payload);
    console.log(`Slash commands registered in guild ${guildId}`);
  } else {
    await rc.application.commands.set(payload);
    console.log('Global slash commands registered');
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName !== 'duel') return;
      const challenger = interaction.user;
      const opponent = interaction.options.getUser('user', true);
      if (opponent.bot) return reject(interaction, 'You cannot duel a bot.');
      if (opponent.id === challenger.id) return reject(interaction, 'You cannot duel yourself.');
      const challengeId = crypto.randomUUID();
      pendingChallenges.set(challengeId, { id: challengeId, challengerId: challenger.id, opponentId: opponent.id });
      return interaction.reply({
        content: `<@${opponent.id}>`,
        embeds: [challengeEmbed({ challengerId: challenger.id, opponentId: opponent.id })],
        components: challengeButtons(challengeId)
      });
    }

    if (!interaction.isButton()) return;
    const [type, id, action] = interaction.customId.split(':');

    if (type === 'challenge') {
      const challenge = pendingChallenges.get(id);
      if (!challenge) return reject(interaction, 'This challenge expired.');
      if (interaction.user.id !== challenge.opponentId) return reject(interaction, 'Only the challenged player can respond.');
      if (action === 'decline') {
        pendingChallenges.delete(id);
        return interaction.update({
          content: null,
          embeds: [new EmbedBuilder().setTitle('Duel Declined').setDescription(`<@${challenge.opponentId}> declined.`).setColor(0x777777)],
          components: []
        });
      }
      if (action === 'accept') {
        pendingChallenges.delete(id);
        const game = createGame({ challengerId: challenge.challengerId, opponentId: challenge.opponentId });
        activeGames.set(game.id, game);
        return interaction.update({ content: null, embeds: [gameEmbed(game)], components: gameButtons(game) });
      }
    }

    if (type === 'duel') {
      const game = activeGames.get(id);
      if (!game) return reject(interaction, 'This duel no longer exists.');
      if (action === 'rematch') {
        const isPlayer = interaction.user.id === game.challengerId || interaction.user.id === game.opponentId;
        if (!isPlayer) return reject(interaction, 'Only duel participants can rematch.');
        const newGame = createGame({ challengerId: game.challengerId, opponentId: game.opponentId });
        activeGames.delete(game.id);
        activeGames.set(newGame.id, newGame);
        return interaction.update({ embeds: [gameEmbed(newGame)], components: gameButtons(newGame) });
      }
      let updated;
      try { updated = applyAction(game, interaction.user.id, action); }
      catch (err) { return reject(interaction, err.message); }
      activeGames.set(updated.id, updated);
      return interaction.update({ embeds: [gameEmbed(updated)], components: gameButtons(updated) });
    }
  } catch (err) {
    console.error(err);
    if (interaction.isRepliable()) reject(interaction, 'Something broke.');
  }
});

client.login(token);
