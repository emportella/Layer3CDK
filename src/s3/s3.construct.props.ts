import { BaseConstructProps } from '../core/base.construct.props';
import { BaseEnvProps } from '../core/base.construct.env.props';
import { S3Config, S3Props } from './s3.default.props';

/**
 * Props for the {@link S3Bucket} construct.
 */
export interface S3BucketProps extends BaseConstructProps {
  /** Logical name for the bucket, used in resource naming (e.g. `'uploads'`). */
  bucketName: string;
  /**
   * Optional structural bucket properties (lifecycle rules, CORS, EventBridge,
   * etc.). Security-sensitive fields are managed by `bucketConfig` and cannot
   * be set here.
   */
  bucketProps?: BaseEnvProps<S3Props>;
  /**
   * Optional environment-aware overrides for the library-managed config
   * (encryption, versioning, removal policy, alarm threshold). Deep-merged on
   * top of the library defaults.
   */
  bucketConfig?: BaseEnvProps<S3Config>;
}
