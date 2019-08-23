'use strict'

const spawnSync = require('child_process').spawnSync

class ServerlessPlugin {
  constructor(serverless, options) {
    this.serverless = serverless
    this.options = options
    this.commands = {
      syncToS3: {
        usage: 'Deploys the `app` directory to your bucket',
        lifecycleEvents: [
          'sync'
        ]
      },
      domainInfo: {
        usage: 'Fetches and prints out the deployed CloudFront domain names',
        lifecycleEvents: [
          'domainInfo'
        ]
      },
      bucketInfo: {
        usage: 'Fetches and prints out the deployed CloudFront bucket names',
        lifecycleEvents: [
          'bucketInfo'
        ]
      },
      invalidateCloudFrontCache: {
        usage: 'Invalidates CloudFront cache',
        lifecycleEvents: [
          'invalidateCache'
        ]
      }
    }

    this.hooks = {
      'syncToS3:sync': this.syncDirectory.bind(this),
      'domainInfo:domainInfo': this.domainInfo.bind(this),
      'bucketInfo:bucketInfo': this.bucketInfo.bind(this),
      'invalidateCloudFrontCache:invalidateCache': this.invalidateCache.bind(this)
    }
  }

  runAwsCommand(args) {
    const result = spawnSync('aws', args)
    const stdout = result.stdout.toString()
    const sterr = result.stderr.toString()
    if (stdout) this.serverless.cli.log(stdout)
    if (sterr) this.serverless.cli.log(sterr)

    return { stdout, sterr }
  }

  getDescribeStacksOutput(outputKey) {
    const provider = this.serverless.getProvider('aws')
    const stackName = provider.naming.getStackName(this.options.stage)
    return provider
      .request(
        'CloudFormation',
        'describeStacks',
        { StackName: stackName },
        this.options.stage,
        this.options.region
      )
      .then((result) => {
        const outputs = result.Stacks[0].Outputs
        const output = outputs.find(entry => entry.OutputKey === outputKey)
        return output.OutputValue
      })
  }

  syncDirectory() {
    this.getDescribeStacksOutput('WebAppS3BucketOutput').then(s3Bucket => {
      const s3LocalPath = this.serverless.variables.service.custom.s3LocalPath
      const s3DestPath = this.serverless.variables.service.custom.s3DestPath || ''
      const args = [
        's3',
        'sync',
        s3LocalPath,
        `s3://${s3Bucket}/${s3DestPath.replace(/^\//, '')}`
      ]
      this.serverless.cli.log(args)
      const result = spawnSync('aws', args)
      const stdout = result && result.stdout && result.stdout.toString()
      const sterr = result && result.stderr && result.stderr.toString()
      this.serverless.cli.log(stdout || 'stdoud undefined')
      this.serverless.cli.log(sterr || 'stderr undefined')
      if (!sterr) this.serverless.cli.log('Successfully synced to the S3 bucket')
    })
  }

  bucketInfo() {
    this.getDescribeStacksOutput('WebAppS3BucketOutput').then(outputValue =>
      this.serverless.cli.log(`Web App Bucket: ${outputValue || 'Not Found'}`)
    )
  }

  async domainInfo() {
    return await this.getDescribeStacksOutput('WebAppCloudFrontDistributionOutput').then(outputValue => {
      this.serverless.cli.log(`Web App Domain: ${outputValue || 'Not Found'}`)
      return outputValue || undefined}
    )
  }

  async invalidateCache() {
    const provider = this.serverless.getProvider('aws')

    const domain = await this.domainInfo()

    const result = await provider.request(
      'CloudFront',
      'listDistributions',
      {},
      this.options.stage,
      this.options.region
    )

    const distributions = result.DistributionList.Items
    const distribution = distributions.find( entry => entry.DomainName === domain )

    if (distribution) {
      this.serverless.cli.log(
        `Invalidating CloudFront distribution with id: ${distribution.Id}`
      )
      const args = [
        'cloudfront',
        'create-invalidation',
        '--distribution-id',
        distribution.Id,
        '--paths',
        '/*'
      ]
      const { sterr } = this.runAwsCommand(args)

      if (!sterr)
        this.serverless.cli.log('Successfully invalidated CloudFront cache')
      else
        throw new Error('Failed invalidating CloudFront cache')

    } else {
      const message = `Could not find distribution with domain ${domain}`
      const error = new Error(message)
      this.serverless.cli.log(message)
      throw error
    }
  }

}

module.exports = ServerlessPlugin
