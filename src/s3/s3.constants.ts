/**
 * `BucketProps` fields that are managed by {@link S3Config} (the library config
 * layer) and therefore must not be set through the structural `bucketProps`
 * layer. This keeps the secure-by-default, environment-aware behaviour in a
 * single place and prevents the two prop layers from conflicting.
 */
export type OmittedBucketProps =
  | 'bucketName'
  | 'removalPolicy'
  | 'autoDeleteObjects'
  | 'versioned'
  | 'encryption'
  | 'encryptionKey'
  | 'enforceSSL'
  | 'blockPublicAccess'
  | 'objectOwnership';

/**
 * `BucketProps` fields that are reserved for the structural `bucketProps` layer
 * (or for the construct itself) and therefore are not exposed through the
 * {@link S3Config} layer.
 */
export type OmittedBucketConfigs = 'bucketName';
