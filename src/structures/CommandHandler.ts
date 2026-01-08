import {
  Attachment,
  BaseMessageOptions,
  Channel,
  Collection,
  CommandInteraction,
  Guild,
  GuildMember,
  InteractionResponse,
  Message,
  Role,
  TextBasedChannel,
  User,
} from 'discord.js'
import { Manager } from '../manager.js'

export type CommandHandlerOptions = {
  interaction?: CommandInteraction
  message?: Message
  language: string
  client: Manager
  args: string[]
  prefix: string
}

export type GlobalMsg = InteractionResponse<boolean> | Message<boolean> | undefined

export enum ParseMentionEnum {
  ERROR,
  USER,
  ROLE,
  EVERYONE,
  CHANNEL,
}

export interface ParseMentionInterface {
  type: ParseMentionEnum
  data: User | Channel | Role | true | 'error' | undefined
}

export class CommandHandler {
  public interaction?: CommandInteraction
  public attactments: Attachment[] = []
  public message?: Message
  public language: string
  public user?: User | null
  public guild?: Guild | null
  public member?: GuildMember | null
  public channel?: TextBasedChannel | null
  public client: Manager
  public args: string[]
  public createdAt: number
  public msg?: GlobalMsg
  public prefix: string
  public modeLang: { enable: string; disable: string }

  public USERS_PATTERN: RegExp = /<@!?(\d{17,19})>/
  public ROLES_PATTERN: RegExp = /<@&(\d{17,19})>/
  public CHANNELS_PATTERN: RegExp = /<#(\d{17,19})>/
  public EVERYONE_PATTERN: RegExp = /@(everyone|here)/

  constructor(options: CommandHandlerOptions) {
    this.client = options.client
    this.interaction = options.interaction
    this.message = options.message
    this.language = options.language
    this.guild = this.guildData
    this.user = this.userData
    this.member = this.memberData
    this.args = options.args
    this.createdAt = this.createdStimeStampData
    this.prefix = options.prefix
    this.channel = this.channelData
    this.modeLang = this.modeLangData
  }

  get userData() {
    return this.interaction ? this.interaction.user : this.message?.author
  }

  get modeLangData() {
    return {
      enable: this.client.i18n.get(this.language, 'global', 'enable'),
      disable: this.client.i18n.get(this.language, 'global', 'disable'),
    }
  }

  get guildData() {
    return this.interaction ? this.interaction.guild : this.message?.guild
  }

  get memberData() {
    return this.interaction ? (this.interaction.member as GuildMember) : this.message?.member
  }

  get createdStimeStampData() {
    return this.interaction
      ? Number(this.interaction.createdTimestamp)
      : Number(this.message?.createdTimestamp)
  }

  get channelData() {
    return this.interaction ? this.interaction.channel : this.message?.channel
  }

  // ===================== MESSAGES =====================

  public async sendMessage(data: string | BaseMessageOptions) {
    if (this.interaction) {
      return this.interaction.reply(data)
    }
    return this.message?.reply(data)
  }

  public async followUp(data: string | BaseMessageOptions) {
    if (this.interaction) {
      return this.interaction.followUp(data)
    }
    return this.message?.reply(data)
  }

  // ===================== FIXED DEFER =====================

  public async deferReply() {
    if (this.interaction) {
      const data = await this.interaction.deferReply()
      this.msg = data
      return data
    }

    const data = await this.message?.reply(`**${this.client.user?.username}** is thinking...`)
    this.msg = data
    return data
  }

  public async editReply(data: BaseMessageOptions): Promise<GlobalMsg> {
    if (!this.msg) {
      this.client.logger.error(CommandHandler.name, 'You have not declared deferReply()')
      return
    }

    if (this.interaction) {
      return this.msg.edit(data)
    }

    if (data.embeds && !data.content) {
      return this.msg.edit({
        content: '',
        embeds: data.embeds,
        components: data.components,
        allowedMentions: data.allowedMentions,
      })
    }

    return this.msg.edit(data)
  }

  // ===================== UTILITIES =====================

  public async parseMentions(data: string): Promise<ParseMentionInterface> {
    if (this.USERS_PATTERN.test(data)) {
      const extract = this.USERS_PATTERN.exec(data)
      const user = await this.client.users.fetch(extract![1]).catch(() => undefined)
      return user
        ? { type: ParseMentionEnum.USER, data: user }
        : { type: ParseMentionEnum.ERROR, data: 'error' }
    }

    if (this.CHANNELS_PATTERN.test(data)) {
      const extract = this.CHANNELS_PATTERN.exec(data)
      const channel = await this.client.channels.fetch(extract![1]).catch(() => undefined)
      return channel
        ? { type: ParseMentionEnum.CHANNEL, data: channel }
        : { type: ParseMentionEnum.ERROR, data: 'error' }
    }

    if (this.ROLES_PATTERN.test(data)) {
      const extract = this.ROLES_PATTERN.exec(data)
      const role = this.message
        ? await this.message.guild?.roles.fetch(extract![1]).catch(() => undefined)
        : await this.interaction?.guild?.roles.fetch(extract![1]).catch(() => undefined)

      return role
        ? { type: ParseMentionEnum.ROLE, data: role }
        : { type: ParseMentionEnum.ERROR, data: 'error' }
    }

    if (this.EVERYONE_PATTERN.test(data)) {
      return { type: ParseMentionEnum.EVERYONE, data: true }
    }

    return { type: ParseMentionEnum.ERROR, data: 'error' }
  }

  public addAttachment(data: Collection<string, Attachment>) {
    this.attactments.push(...data.map((d) => d))
    return this.attactments
  }
}
