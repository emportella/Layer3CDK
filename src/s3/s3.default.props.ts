import { RemovalPolicy } from 'aws-cdk-lib';
import {
  BlockPublicAccess,
  BucketEncryption,
  BucketProps,
  ObjectOwnership,
} from 'aws-cdk-lib/aws-s3';
import { BaseEnvProps } from '../core';
import { OmittedBucketConfigs, OmittedBucketProps } from './s3.constants';

/** One gibibyte in bytes — used to express storage alarm thresholds. */
const GIB = 1024 ** 3;

export type S3AlarmThresholds = {
  /**
   * Threshold, in bytes, for the `BucketSizeBytes` (StandardStorage) alarm.
   * S3 exposes no native operational metrics, so this storage-growth alarm
   * acts as a cost/runaway guardrail. Defaults are intentionally generous —
   * override per environment to match your workload.
   */
  alarmBucketSizeBytesThreshold: number;
};

/**
 * Library-managed, environment-aware configuration for {@link S3Bucket}.
 * These fields enforce secure defaults and ship the storage alarm threshold.
 * Users override per environment via `bucketConfig`; values are deep-merged
 * on top of {@link S3_ENVIRONMENTS_PROPS}.
 */
export type S3Config = Omit<BucketProps, OmittedBucketConfigs> &
  S3AlarmThresholds;

/**
 * Structural passthrough to the underlying CDK `Bucket`. Security-sensitive
 * fields are managed by {@link S3Config} and omitted here so the two layers
 * cannot conflict.
 */
export type S3Props = Omit<BucketProps, OmittedBucketProps>;

/**
 * Library-provided environment defaults for {@link S3Bucket}.
 * Secure-by-default everywhere; production additionally retains the bucket and
 * enables versioning. User overrides are deep-merged via
 * `resolveAndMergeEnvProps()`.
 */
export const S3_ENVIRONMENTS_PROPS: BaseEnvProps<S3Config> = {
  default: {
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    encryption: BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
    versioned: false,
    removalPolicy: RemovalPolicy.DESTROY,
    autoDeleteObjects: true,
    alarmBucketSizeBytesThreshold: 50 * GIB,
  },
  prd: {
    blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
    encryption: BucketEncryption.S3_MANAGED,
    enforceSSL: true,
    objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
    versioned: true,
    removalPolicy: RemovalPolicy.RETAIN,
    autoDeleteObjects: false,
    alarmBucketSizeBytesThreshold: 500 * GIB,
  },
};
