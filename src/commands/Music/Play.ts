import {
  ApplicationCommandOptionType,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  EmbedBuilder,
} from 'discord.js'
import { convertTime } from '../../utilities/ConvertTime.js'
import { Manager } from '../../manager.js'
import { Accessableby, Command } from '../../structures/Command.js'
import { AutocompleteInteractionChoices, GlobalInteraction } from '../../@types/Interaction.js'
import { CommandHandler } from '../../structures/CommandHandler.js'
import { RainlinkSearchResultType, RainlinkTrack } from 'rainlink'

export default class implements Command {
  public name = ['play']
  public description = 'Play a song from any types'
  public category = 'Music'
  public accessableby = [Accessableby.Member]
  public usage = '<name_or_url>'
  public aliases = ['p', 'pl', 'pp']
  public lavalink = true
  public playerCheck = false
  public usingInteraction = true
  public sameVoiceCheck = false
  public permissions = []
  public options = [
    {
      name: 'search',
      description: 'The song link or name',
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    },
  ]

  public async execute(client: Manager, handler: CommandHandler) {
    await handler.deferReply()

    let player = client.rainlink.players.get(handler.guild!.id)
    const value = handler.args.join(' ')
    const maxLength = await client.db.maxlength.get(handler.user.id)

    if (!value)
      return handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(handler.language, 'command.music', 'play_arg'))
            .setColor(client.color),
        ],
      })

    const { channel } = handler.member!.voice
    if (!channel)
      return handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(handler.language, 'error', 'no_in_voice'))
            .setColor(client.color),
        ],
      })

    const emotes = (str: string) => str.match(/<a?:.+?:\d{18}>|\p{Extended_Pictographic}/gu)
    if (emotes(value))
      return handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(handler.language, 'command.music', 'play_emoji'))
            .setColor(client.color),
        ],
      })

    if (!player)
      player = await client.rainlink.create({
        guildId: handler.guild!.id,
        voiceId: channel.id,
        textId: handler.channel!.id,
        shardId: handler.guild?.shardId ?? 0,
        deaf: true,
        volume: client.config.player.DEFAULT_VOLUME,
      })
    else if (!this.checkSameVoice(client, handler)) return

    player.textId = handler.channel!.id

    const result = await player.search(value, { requester: handler.user })
    const tracks = result.tracks.filter((e) =>
      typeof maxLength === 'number' ? e.duration <= maxLength : true
    )

    if (!tracks.length)
      return handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(handler.language, 'command.music', 'play_match'))
            .setColor(client.color),
        ],
      })

    if (result.type === 'PLAYLIST') tracks.forEach((t) => player.queue.add(t))
    else player.queue.add(tracks[0])

    if (!player.playing) player.play()

    const embed = new EmbedBuilder().setColor(client.color)

    if (result.type === 'TRACK' || result.type === 'SEARCH') {
      embed.setDescription(
        client.i18n.get(handler.language, 'command.music', 'play_track', {
          title: this.getTitle(client, result.type, tracks),
          duration: convertTime(tracks[0].duration),
          request: String(tracks[0].requester),
        })
      )
    } else if (result.type === 'PLAYLIST') {
      embed.setDescription(
        client.i18n.get(handler.language, 'command.music', 'play_playlist', {
          title: this.getTitle(client, result.type, tracks, value),
          duration: convertTime(player.queue.duration),
          songs: String(tracks.length),
          request: String(tracks[0].requester),
        })
      )
    }

    return handler.editReply({ embeds: [embed] })
  }

  checkSameVoice(client: Manager, handler: CommandHandler) {
    if (handler.member!.voice.channel !== handler.guild!.members.me!.voice.channel) {
      handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(handler.language, 'error', 'no_same_voice'))
            .setColor(client.color),
        ],
      })
      return false
    }
    return true
  }

  getTitle(
    client: Manager,
    type: RainlinkSearchResultType,
    tracks: RainlinkTrack[],
    value?: string
  ) {
    if (client.config.player.AVOID_SUSPEND) return tracks[0].title
    if (type === 'PLAYLIST') return `[${tracks[0].title}](${value})`
    return `[${tracks[0].title}](${tracks[0].uri})`
  }

  // Autocomplete
  async autocomplete(client: Manager, interaction: GlobalInteraction, language: string) {
    if (!interaction.isAutocomplete()) return

    const choice: AutocompleteInteractionChoices[] = []
    const url = interaction.options.getString('search') ?? ''

    const maxLength = await client.db.maxlength.get(interaction.user.id)
    const Random =
      client.config.player.AUTOCOMPLETE_SEARCH[
        Math.floor(Math.random() * client.config.player.AUTOCOMPLETE_SEARCH.length)
      ]

    if (client.REGEX.some((r) => r.test(url))) {
      choice.push({ name: url, value: url })
      return interaction.respond(choice).catch(() => {})
    }

    const searchRes = await client.rainlink.search(url || Random)
    const tracks = searchRes.tracks.filter((e) =>
      typeof maxLength === 'number' ? e.duration <= maxLength : true
    )

    for (const x of tracks.slice(0, 10)) {
      choice.push({
        name: x.title ?? 'Unknown track',
        value: x.uri ?? url,
      })
    }

    await interaction.respond(choice).catch(() => {})
  }
}
