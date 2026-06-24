import { pascalCaseToKebabCase, trimDashes } from '../util';
import { BaseConfig } from '../core/base.config';

/**
 * Generates a general-purpose S3 bucket name.
 * Bucket names must be globally unique, lowercase, and max 63 characters.
 * @param bucketName - The logical bucket name (e.g. `'uploads'`).
 * @param config - The {@link BaseConfig} object.
 * @returns e.g. `"dev-banana-launcher-uploads"`
 */
export const s3BucketName = (
  bucketName: string,
  config: BaseConfig,
): string => {
  const serviceName = trimDashes(pascalCaseToKebabCase(config.serviceName));
  const name = trimDashes(pascalCaseToKebabCase(bucketName));
  return `${config.stackEnv}-${serviceName}-${name}`.toLowerCase();
};
