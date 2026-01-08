import {
  EmbedBuilder,
  ApplicationCommandOptionType,
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js'
import { convertTime } from '../../utilities/ConvertTime.js'
import { Manager } from '../../manager.js'
import { Accessableby, Command } from '../../structures/Command.js'
import { CommandHandler } from '../../structures/CommandHandler.js'
import { AutocompleteInteractionChoices, GlobalInteraction } from '../../@types/Interaction.js'
import { RainlinkSearchResultType, RainlinkTrack } from 'rainlink'

const TrackAdd: RainlinkTrack[] = []

export default class implements Command {
  public name = ['pl', 'add']
  public description = 'Add song to a playlist'
  public category = 'Playlist'
  public accessableby = [Accessableby.Member]
  public usage = '<playlist_id> <url_or_name>'
  public aliases = []
  public lavalink = true
  public playerCheck = false
  public usingInteraction = true
  public sameVoiceCheck = false
  public permissions = []

  public options = [
    {
      name: 'id',
      description: 'The id of the playlist',
      required: true,
      type: ApplicationCommandOptionType.String,
    },
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

    const maxLength = await client.db.maxlength.get(handler.user.id)
    const value = handler.args[0]

    if (!value)
      return handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(handler.language, 'command.playlist', 'invalid'))
            .setColor(client.color),
        ],
      })

    const input = handler.args[1]
    if (!input)
      return handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(handler.language, 'command.playlist', 'add_match'))
            .setColor(client.color),
        ],
      })

    const result = await client.rainlink.search(input, { requester: handler.user })
    const tracks = result.tracks.filter((e) =>
      typeof maxLength === 'number' ? e.duration <= maxLength : true
    )

    if (!tracks.length)
      return handler.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(handler.language, 'command.playlist', 'add_match'))
            .setColor(client.color),
        ],
      })

    if (result.type === 'PLAYLIST') tracks.forEach((t) => TrackAdd.push(t))
    else TrackAdd.push(tracks[0])

    const playlist = await client.db.playlist.get(value)
    if (!playlist)
      return handler.followUp({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(handler.language, 'command.playlist', 'invalid'))
            .setColor(client.color),
        ],
      })

    if (playlist.owner !== handler.user.id) {
      TrackAdd.length = 0
      return handler.followUp({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(handler.language, 'command.playlist', 'add_owner'))
            .setColor(client.color),
        ],
      })
    }

    const limit = playlist.tracks!.length + TrackAdd.length
    if (limit > client.config.player.LIMIT_TRACK) {
      TrackAdd.length = 0
      return handler.followUp({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              client.i18n.get(handler.language, 'command.playlist', 'add_limit_track', {
                limit: String(client.config.player.LIMIT_TRACK),
              })
            )
            .setColor(client.color),
        ],
      })
    }

    for (const track of TrackAdd) {
      await client.db.playlist.push(`${value}.tracks`, {
        title: track.title,
        uri: track.uri,
        length: track.duration,
        thumbnail: track.artworkUrl,
        author: track.author,
        requester: track.requester,
      })
    }

    const embed = new EmbedBuilder()
      .setDescription(
        client.i18n.get(handler.language, 'command.playlist', 'add_added', {
          count: String(TrackAdd.length),
          playlist: value,
        })
      )
      .setColor(client.color)

    TrackAdd.length = 0
    return handler.followUp({ embeds: [embed] })
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
  public async autocomplete(client: Manager, interaction: GlobalInteraction, language: string) {
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
