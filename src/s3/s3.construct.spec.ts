import { App, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BaseConfig } from '../core';
import { S3Bucket } from './s3.construct';
import { testconfig } from '../test/common.test.const';

describe('S3Bucket', () => {
  let stack: Stack;
  let config: BaseConfig;
  let bucketName: string;

  beforeEach(() => {
    stack = new Stack();
    config = testconfig;
    bucketName = 'uploads';
  });

  it('should create an S3 bucket with the correct name', () => {
    new S3Bucket(stack, { config, bucketName });
    Template.fromStack(stack).hasResourceProperties('AWS::S3::Bucket', {
      BucketName: 'dev-banana-launcher-uploads',
    });
  });

  it('should block all public access and enforce S3-managed encryption', () => {
    new S3Bucket(stack, { config, bucketName });
    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          {
            ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' },
          },
        ],
      },
    });
  });

  it('should enforce SSL via a deny-non-secure-transport bucket policy', () => {
    new S3Bucket(stack, { config, bucketName });
    Template.fromStack(stack).hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: 'Deny',
            Condition: { Bool: { 'aws:SecureTransport': 'false' } },
          }),
        ]),
      },
    });
  });

  it('should not enable versioning by default (non-prod)', () => {
    new S3Bucket(stack, { config, bucketName });
    const buckets = Template.fromStack(stack).findResources('AWS::S3::Bucket', {
      Properties: { VersioningConfiguration: { Status: 'Enabled' } },
    });
    expect(Object.keys(buckets)).toHaveLength(0);
  });

  it('should apply structural bucketProps such as lifecycle rules', () => {
    new S3Bucket(stack, {
      config,
      bucketName,
      bucketProps: {
        default: {
          lifecycleRules: [{ expiration: Duration.days(30) }],
        },
      },
    });
    Template.fromStack(stack).hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({ ExpirationInDays: 30, Status: 'Enabled' }),
        ]),
      },
    });
  });

  describe('alarms', () => {
    it('should create a bucket size alarm via setCloudWatchAlarms', () => {
      const bucket = new S3Bucket(stack, { config, bucketName });
      bucket.setCloudWatchAlarms();
      Template.fromStack(stack).hasResourceProperties(
        'AWS::CloudWatch::Alarm',
        {
          Namespace: 'AWS/S3',
          MetricName: 'BucketSizeBytes',
          Threshold: 50 * 1024 ** 3,
          ComparisonOperator: 'GreaterThanOrEqualToThreshold',
        },
      );
    });

    it('should honor a custom alarm threshold from bucketConfig', () => {
      const bucket = new S3Bucket(stack, {
        config,
        bucketName,
        bucketConfig: {
          default: { alarmBucketSizeBytesThreshold: 1024 },
        },
      });
      bucket.setCloudWatchAlarms();
      Template.fromStack(stack).hasResourceProperties(
        'AWS::CloudWatch::Alarm',
        { Threshold: 1024 },
      );
    });
  });

  describe('grants', () => {
    let role: Role;

    beforeEach(() => {
      role = new Role(stack, 'TestRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
      });
    });

    it('grantPolicies should grant read and write actions', () => {
      const bucket = new S3Bucket(stack, { config, bucketName });
      bucket.grantPolicies(role);
      Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: Match.arrayWith(['s3:GetObject*', 's3:PutObject']),
            }),
          ]),
        },
      });
    });

    it('grantReadOnlyPolicies should not grant write actions', () => {
      const bucket = new S3Bucket(stack, { config, bucketName });
      bucket.grantReadOnlyPolicies(role);
      const policies =
        Template.fromStack(stack).findResources('AWS::IAM::Policy');
      const serialized = JSON.stringify(policies);
      expect(serialized).toContain('s3:GetObject');
      expect(serialized).not.toContain('s3:PutObject');
    });
  });

  describe('production validations', () => {
    const prdConfig = new BaseConfig({
      ...testconfig,
      stackEnv: 'prd',
      tags: { ...testconfig.tags, 'Eng:Env': 'prd' },
    });

    it('should default to retain + versioned in prd and synth cleanly', () => {
      const app = new App();
      const prdStack = new Stack(app, 'PrdStack');
      new S3Bucket(prdStack, { config: prdConfig, bucketName });
      const template = Template.fromStack(prdStack);
      template.hasResourceProperties('AWS::S3::Bucket', {
        VersioningConfiguration: { Status: 'Enabled' },
      });
      template.hasResource('AWS::S3::Bucket', {
        DeletionPolicy: 'Retain',
      });
    });

    it('should fail validation when RemovalPolicy.DESTROY is used in prd', () => {
      const app = new App();
      const prdStack = new Stack(app, 'PrdStack');
      new S3Bucket(prdStack, {
        config: prdConfig,
        bucketName,
        bucketConfig: {
          default: {
            alarmBucketSizeBytesThreshold: 1,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
          },
          prd: {
            alarmBucketSizeBytesThreshold: 1,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            versioned: false,
          },
        },
      });
      expect(() => app.synth()).toThrow(/production environment/);
    });
  });
});
