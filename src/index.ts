import * as core from '@actions/core'
import { CloudFormation, DescribeStacksCommandOutput, Output } from '@aws-sdk/client-cloudformation'
import {formatter} from './format'
import {appendFileSync, existsSync, writeFileSync} from 'fs'
import { snakeCase } from 'snake-case';

async function run() {
  const region = process.env.AWS_DEFAULT_REGION

  var cloudformation = new CloudFormation({region});


  try {
    const stackNamesInput = core.getInput('stack-names', {required: false})
    const tagFiltersInput = core.getInput('tag-filters', {required: false})
    const format = core.getInput('format', {required: true})
    const output = core.getInput('output', {required: true})
    const prefix = core.getInput('prefix')
    const allOutputs: Output[] = []

    let nextToken: string

    let stackNames = stackNamesInput == '' ? [] : stackNamesInput.split(',')
    let tagFilters = tagFiltersInput == '' ? [] : tagFiltersInput.split(',')
    try {
      do {
        const result: DescribeStacksCommandOutput = await cloudformation
          .describeStacks({
            NextToken: nextToken
          })

        let outputs = result.Stacks
          .filter(stack => stackNames.length == 0 || stackNames.includes(stack.StackName))
          .filter(stack => {
            if (tagFilters.length == 0) return true;
            const stackTags = (stack.Tags || []).map(tag => `${tag.Key}:${tag.Value}`);

            return tagFilters.every((filterValue) => stackTags.includes(filterValue));
          })
          .filter(stack => stack.Outputs != null)
          .flatMap(stack => stack.Outputs)


        nextToken = result.NextToken
        allOutputs.push(...outputs)
      } while (nextToken)

      const envs = allOutputs
        .map<Output>(output => ({
          OutputValue: output.OutputValue,
          OutputKey: snakeCase(output.OutputKey).toUpperCase(),
        }))
        .map<string>(formatter(format)(prefix))
      if (envs.length > 0) {
        envs.push('\n')
      }

      if (existsSync(output)) {
        console.log(`append to ${output} file`)
        appendFileSync(output, '\n' + envs.join('\n'))
      } else {
        console.log(`create ${output} file`)
        writeFileSync(output, envs.join('\n'))
      }
    } catch (e) {
      core.error(e)
      core.setFailed(e.message)
    }
  } catch (e) {
    core.setFailed(e.message)
  }
}

run()
