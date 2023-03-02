const AWS = require('aws-sdk');

AWS.config.update({
  accessKeyId: 'AKIA6EW533LXXRNVFAPW',
  secretAccessKey: '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',
  region: 'us-east-1'
});

const s3 = new AWS.S3();

function getSignUrl (key) {

	const params = {
	  Bucket: 'bioapz',
	  Key: key,
	  Expires: 3600 // The number of seconds until the URL expires
	};
	// Generate the signed URL
	const signedUrl = s3.getSignedUrl('getObject', params);
  return `${signedUrl}`;
}
const fileFilter = (req,file,cb) => {

  if(file.mimetype === 'image/jpeg' || file.mimetype === 'image/png'){
    cb(null,true)
  }else{
    cb(new Error('Invalid image'),false);
  }
}

module.exports = {
  getSignUrl,s3, fileFilter
};