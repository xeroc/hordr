import {Args, Command, Flags} from '@oclif/core'

import {getBean, getBody} from '../beans/client.js'
import {type BeanType, validateSpec} from '../beans/validate-spec.js'

export default class ValidateSpec extends Command {
  static args = {bean: Args.string({description: 'Bean id whose body to validate', required: true})}
  static description =
    'Check body sections are present and non-empty. Epics: 6 sections. Tasks/bugs: 4 sections. Exit 0 if valid, 1 if not.'
  static examples = ['<%= config.bin %> <%= command.id %> hordr-1234']
  static flags = {
    json: Flags.boolean({default: false, description: 'Emit {valid, missing, empty} as JSON'}),
  }

  async run(): Promise<void> {
    const {args, flags} = await this.parse(ValidateSpec)
    // Type-aware dispatch (ADR-0008). Read the bean to get its type.
    const bean = getBean(args.bean)
    const type = (bean.type ?? 'task') as BeanType
    const result = validateSpec(getBody(args.bean), type)

    if (flags.json) {
      this.log(JSON.stringify({...result, type}))
    } else if (result.valid) {
      this.log(`\u2713 ${args.bean} spec is valid (${type}: ${type === 'epic' ? '6' : '4'} sections)`)
    } else {
      if (result.missing.length > 0) this.log(`missing sections: ${result.missing.join(', ')}`)
      if (result.empty.length > 0) this.log(`empty sections: ${result.empty.join(', ')}`)
    }

    // Exit 1 = invalid spec (normal failure); NOT this.error() which would exit 2 (usage error).
    if (!result.valid) process.exitCode = 1
  }
}
