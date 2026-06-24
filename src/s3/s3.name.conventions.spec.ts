import { testconfig } from '../test/common.test.const';
import { s3BucketName } from './s3.name.conventions';

describe('S3 Name Conventions', () => {
  describe('s3BucketName', () => {
    it('should return the correct bucket name', () => {
      expect(s3BucketName('uploads', testconfig)).toEqual(
        'dev-banana-launcher-uploads',
      );
    });

    it('should kebab-case a PascalCase logical name', () => {
      expect(s3BucketName('UserUploads', testconfig)).toEqual(
        'dev-banana-launcher-user-uploads',
      );
    });

    it('should lowercase the entire bucket name', () => {
      const name = s3BucketName('MyBucket', testconfig);
      expect(name).toEqual(name.toLowerCase());
    });
  });
});
