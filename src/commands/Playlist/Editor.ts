import {
  EmbedBuilder,
  ApplicationCommandOptionType,
  Message,
  ActionRowBuilder,
  TextInputBuilder,
  ModalBuilder,
  TextInputStyle,
  ChatInputCommandInteraction,
} from 'discord.js'
import { Manager } from '../../manager.js'
import { Accessableby, Command } from '../../structures/Command.js'
import { CommandHandler } from '../../structures/CommandHandler.js'

let count = 0
let answer: string[] = []

export default class implements Command {
  public name = ['pl', 'editor']
  public description = 'Edit playlist info for public'
  public category = 'Playlist'
  public accessableby = [Accessableby.Member]
  public usage = '<playlist_id>'
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
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ]

  public async execute(client: Manager, handler: CommandHandler) {
    if (handler.message) {
      await this.prefixMode(client, handler.message, handler.args, handler.language)
    } else if (handler.interaction) {
      await this.interactionMode(
        client,
        handler.interaction as ChatInputCommandInteraction,
        handler.language
      )
    }
  }

  // ================= PREFIX MODE =================
  private async prefixMode(client: Manager, message: Message, args: string[], language: string) {
    const value = args[0]
    if (!value)
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(language, 'command.playlist', 'edit_arg'))
            .setColor(client.color),
        ],
      })

    const playlist = await client.db.playlist.get(value)
    if (!playlist)
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(language, 'command.playlist', 'edit_notfound'))
            .setColor(client.color),
        ],
      })

    if (playlist.owner !== message.author.id)
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(language, 'command.playlist', 'edit_playlist_owner'))
            .setColor(client.color),
        ],
      })

    const questions = this.questionString(client, language)

    for (const q of questions) {
      const send = await message.reply(q.question)
      const res = await send.channel.awaitMessages({
        filter: (m) => m.author.id === message.author.id,
        max: 1,
        time: 30000,
      })

      const msg = res.first()?.content ?? ''
      answer.push(msg)
      count++
    }

    const [idCol, nameCol, desCol, modeCol] = answer

    const newId = idCol || null
    const newName = nameCol || playlist.name
    const newDes = desCol || playlist.description || 'null'
    const newMode = modeCol || playlist.private

    if (this.validMode(String(newMode)) === null) {
      count = 0
      answer = []
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(language, 'command.playlist', 'edit_invalid_mode'))
            .setColor(client.color),
        ],
      })
    }

    if (newId && newId !== playlist.id) {
      if (!this.vaildId(newId)) {
        count = 0
        answer = []
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(client.i18n.get(language, 'command.playlist', 'edit_invalid_id'))
              .setColor(client.color),
          ],
        })
      }

      if (await client.db.playlist.get(newId)) {
        count = 0
        answer = []
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                client.i18n.get(language, 'command.playlist', 'ineraction_edit_invalid_id')
              )
              .setColor(client.color),
          ],
        })
      }

      await client.db.playlist.set(newId, {
        ...playlist,
        id: newId,
        name: newName,
        description: newDes,
        private: newMode,
      })

      await client.db.playlist.delete(playlist.id)
    } else {
      await client.db.playlist.set(`${playlist.id}.name`, newName)
      await client.db.playlist.set(`${playlist.id}.description`, newDes)
      await client.db.playlist.set(`${playlist.id}.private`, newMode)
    }

    count = 0
    answer = []

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            client.i18n.get(language, 'command.playlist', 'edit_success', {
              playlistId: newId ?? playlist.id,
            })
          )
          .setColor(client.color),
      ],
    })
  }

  // ================= INTERACTION MODE =================
  private async interactionMode(
    client: Manager,
    interaction: ChatInputCommandInteraction,
    language: string
  ) {
    const value = interaction.options.getString('id', true)

    const playlist = await client.db.playlist.get(value)
    if (!playlist)
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              client.i18n.get(language, 'command.playlist', 'ineraction_edit_notfound')
            )
            .setColor(client.color),
        ],
      })

    if (playlist.owner !== interaction.user.id)
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setDescription(
              client.i18n.get(language, 'command.playlist', 'ineraction_edit_playlist_owner')
            )
            .setColor(client.color),
        ],
      })

    const modal = new ModalBuilder()
      .setCustomId('playlist_editor')
      .setTitle('Playlist editor')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('pl_id')
            .setLabel('Playlist ID')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('pl_name')
            .setLabel('Playlist name')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('pl_des')
            .setLabel('Playlist description')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('pl_mode')
            .setLabel('public / private')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      )

    await interaction.showModal(modal)

    const submit = await interaction.awaitModalSubmit({
      time: 60000,
      filter: (i) => i.user.id === interaction.user.id,
    })

    await submit.deferReply()

    const idCol = submit.fields.getTextInputValue('pl_id')
    const nameCol = submit.fields.getTextInputValue('pl_name')
    const desCol = submit.fields.getTextInputValue('pl_des')
    const modeCol = submit.fields.getTextInputValue('pl_mode')

    const newId = idCol || null
    const newName = nameCol || playlist.name
    const newDes = desCol || playlist.description || 'null'
    const newMode = modeCol || playlist.private

    if (this.validMode(String(newMode)) === null)
      return submit.editReply({
        embeds: [
          new EmbedBuilder()
            .setDescription(client.i18n.get(language, 'command.playlist', 'edit_invalid_mode'))
            .setColor(client.color),
        ],
      })

    if (newId && newId !== playlist.id) {
      if (!this.vaildId(newId) || (await client.db.playlist.get(newId)))
        return submit.editReply({
          embeds: [
            new EmbedBuilder()
              .setDescription(
                client.i18n.get(language, 'command.playlist', 'ineraction_edit_invalid_id')
              )
              .setColor(client.color),
          ],
        })

      await client.db.playlist.set(newId, {
        ...playlist,
        id: newId,
        name: newName,
        description: newDes,
        private: newMode,
      })

      await client.db.playlist.delete(playlist.id)
    } else {
      await client.db.playlist.set(`${playlist.id}.name`, newName)
      await client.db.playlist.set(`${playlist.id}.description`, newDes)
      await client.db.playlist.set(`${playlist.id}.private`, newMode)
    }

    return submit.editReply({
      embeds: [
        new EmbedBuilder()
          .setDescription(
            client.i18n.get(language, 'command.playlist', 'ineraction_edit_success', {
              playlistId: newId ?? playlist.id,
            })
          )
          .setColor(client.color),
      ],
    })
  }

  private vaildId(id: string) {
    return /^[\w&.-]+$/.test(id)
  }

  private validMode(value: string) {
    value = String(value).trim().toLowerCase()
    if (value === 'public' || value === 'true') return true
    if (value === 'private' || value === 'false') return false
    return null
  }

  private questionString(client: Manager, language: string) {
    return [
      { question: client.i18n.get(language, 'command.playlist', 'edit_playlist_id_label') },
      { question: client.i18n.get(language, 'command.playlist', 'edit_playlist_name_label') },
      { question: client.i18n.get(language, 'command.playlist', 'edit_playlist_des_label') },
      { question: client.i18n.get(language, 'command.playlist', 'edit_playlist_private_label') },
    ]
  }
}
