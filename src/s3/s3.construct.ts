import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  ComparisonOperator,
  IAlarmAction,
  Metric,
  Stats,
  TreatMissingData,
} from 'aws-cdk-lib/aws-cloudwatch';
import { Effect, PolicyStatement, Role } from 'aws-cdk-lib/aws-iam';
import { Bucket, BucketProps } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import {
  BaseConstruct,
  resolveEnvProps,
  resolveAndMergeEnvProps,
} from '../core';
import { S3BucketProps as S3BucketConstructProps } from './s3.construct.props';
import { s3BucketName } from './s3.name.conventions';
import {
  S3Props,
  S3Config,
  S3AlarmThresholds,
  S3_ENVIRONMENTS_PROPS,
} from './s3.default.props';

/**
 * General-purpose S3 bucket construct with secure defaults, environment-aware
 * configuration, a storage-growth CloudWatch alarm, IAM grants, and production
 * validations (retain on delete, versioning, no auto-delete).
 *
 * Secure by default: all public access blocked, SSL enforced, S3-managed
 * encryption, and bucket-owner-enforced object ownership.
 *
 * @example
 * ```typescript
 * const bucket = new S3Bucket(this, {
 *   config,
 *   bucketName: 'uploads',
 *   bucketProps: {
 *     default: {
 *       lifecycleRules: [{ expiration: Duration.days(90) }],
 *     },
 *   },
 * });
 * bucket.grantPolicies(serviceAccountRole.getRole());
 * bucket.setCloudWatchAlarms(alarmAction);
 * ```
 */
export class S3Bucket extends BaseConstruct<Bucket> {
  protected readonly resource: Bucket;
  readonly bucketName: string;
  readonly bucketProps: BucketProps;
  protected readonly alarmsThresholds: S3AlarmThresholds;

  constructor(scope: Construct, props: S3BucketConstructProps) {
    const { config, bucketName, bucketProps, bucketConfig } = props;
    super(scope, 's3', bucketName, config);
    this.bucketName = s3BucketName(bucketName, config);
    const resolvedProps = resolveEnvProps(
      bucketProps ?? { default: {} },
      config,
    );
    const resolvedConfig = resolveAndMergeEnvProps(
      S3_ENVIRONMENTS_PROPS,
      config,
      bucketConfig,
    );
    this.bucketProps = this.buildBucketProps(
      resolvedProps,
      resolvedConfig,
      this.bucketName,
    );
    this.alarmsThresholds = resolvedConfig;
    this.validateProps();
    this.resource = new Bucket(
      this,
      this.resolver.childId('s3'),
      this.bucketProps,
    );
  }

  /**
   * Builds the {@link BucketProps} object, layering the structural props and
   * library-managed config on top of the resolved bucket name.
   */
  private buildBucketProps(
    s3Props: S3Props,
    s3Config: S3Config,
    bucketName: string,
  ): BucketProps {
    return {
      bucketName: bucketName,
      ...s3Props,
      ...s3Config,
    };
  }

  /**
   * Validates the properties of the S3 construct.
   * In the `prd` environment the bucket must retain on delete, must not
   * auto-delete objects, and must have versioning enabled.
   */
  protected validateProps(): void {
    const validationErrors: string[] = [];
    if (this.config.stackEnv === 'prd') {
      if (this.bucketProps.removalPolicy === RemovalPolicy.DESTROY) {
        validationErrors.push(
          'S3 bucket must not use RemovalPolicy.DESTROY in production environment',
        );
      }
      if (this.bucketProps.autoDeleteObjects) {
        validationErrors.push(
          'S3 bucket must not use autoDeleteObjects in production environment',
        );
      }
      if (!this.bucketProps.versioned) {
        validationErrors.push(
          'Versioning must be enabled in production environment',
        );
      }
    }
    if (validationErrors.length > 0) {
      this.node.addValidation({
        validate: () => validationErrors,
      });
    }
  }

  /**
   * Retrieves the ARN (Amazon Resource Name) of the S3 bucket.
   * @returns The ARN of the S3 bucket.
   */
  public getArn(): string {
    return this.resource.bucketArn;
  }

  /**
   * Returns the underlying CDK {@link Bucket} for advanced wiring (event
   * notifications, additional policies, deployments, etc.).
   */
  public getBucket(): Bucket {
    return this.resource;
  }

  /**
   * Outputs the ARN of the S3 bucket.
   */
  public outputArn(): void {
    const exportName = this.resolver.arnExportName();
    new CfnOutput(this, exportName, {
      value: this.resource.bucketArn,
      exportName,
      description: `The ARN of the S3 bucket ${this.bucketName}`,
    });
  }

  /**
   * Sets up CloudWatch alarms for the S3 bucket.
   *
   * S3 has no native operational metrics, so the default alarm watches the
   * daily `BucketSizeBytes` (StandardStorage) metric as a storage-growth /
   * cost guardrail. The threshold comes from `S3Config.alarmBucketSizeBytesThreshold`.
   * Define additional alarms via {@link setCustomAlarms}.
   * @param alarmActions - The actions to be taken when an alarm is triggered (Optional).
   */
  public setCloudWatchAlarms(...alarmActions: IAlarmAction[]): void {
    this.createAlarm(
      'bucket-size-bytes',
      {
        metric: new Metric({
          namespace: 'AWS/S3',
          metricName: 'BucketSizeBytes',
          dimensionsMap: {
            BucketName: this.bucketName,
            StorageType: 'StandardStorage',
          },
          period: Duration.days(1),
          statistic: Stats.MAXIMUM,
        }),
        alarmName: `${this.resourceName} Bucket Size Bytes Alarm`,
        alarmDescription: `Alarm if ${this.resourceName} bucket size exceeds ${this.alarmsThresholds.alarmBucketSizeBytesThreshold} bytes`,
        threshold: this.alarmsThresholds.alarmBucketSizeBytesThreshold,
        comparisonOperator:
          ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        datapointsToAlarm: 1,
        treatMissingData: TreatMissingData.IGNORE,
      },
      ...alarmActions,
    );
  }

  /**
   * Grants read and write access to the S3 bucket to the specified IAM role.
   * @param iamRole The IAM role to grant access to.
   */
  public grantPolicies(iamRole: Role): void {
    this.resource.grantReadWrite(iamRole);
  }

  /**
   * Grants read-only access to the S3 bucket to the specified IAM role.
   * @param iamRole The IAM role to grant access to.
   */
  public grantReadOnlyPolicies(iamRole: Role): void {
    this.resource.grantRead(iamRole);
  }

  /**
   * Grants custom S3 actions on the bucket (and its objects) to an IAM role.
   * The actions are scoped to the bucket ARN and `<bucket-arn>/*`.
   * @param iamRole The IAM role to grant the policies to.
   * @param actions The S3 actions to grant (e.g. `'s3:GetObject'`).
   */
  public grantCustomPolicies(iamRole: Role, ...actions: string[]): void {
    iamRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions,
        resources: [this.resource.bucketArn, this.resource.arnForObjects('*')],
      }),
    );
  }

  public resourceRemovalPolicy(
    removalPolicy: RemovalPolicy.DESTROY | RemovalPolicy.RETAIN,
  ): void {
    this.resource.applyRemovalPolicy(removalPolicy);
  }
}
