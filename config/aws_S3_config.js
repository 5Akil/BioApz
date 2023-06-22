var commonConfig = require('../config/common_config');
var _ = require('underscore')

const AWS = require('aws-sdk');

AWS.config.update({
  accessKeyId: 'AKIA6EW533LXXRNVFAPW',
  secretAccessKey: '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',
  region: 'us-east-1',
});

const s3 = new AWS.S3();
const Bucket = 'bioapz';

function getSignUrl (key) {
  return new Promise((resolve, reject) => {
    if(key != null && !_.isEmpty(key)){
      const params = {
        Bucket: Bucket,
        Key: key
      };
  
        s3.headObject(params, (err, metadata) => {
  
          if ((err && err.code === 'NotFound') || (err =='Forbidden: null')) {
            
            resolve(commonConfig.default_image);
          }  else {
            const urlParams = {
              Bucket: Bucket,
              Key: key,
              Expires: 3600
            };
            const signedUrl = s3.getSignedUrl('getObject', urlParams);
            resolve(signedUrl);
          }
        });
    }else{
      resolve(commonConfig.default_image);
    }
  });
  
}

function deleteImageAWS(params){

  s3.headObject(params, function(err, metadata) {
    if (err && err.code === 'NotFound') {
      console.log('Image not found in folder ' + params.Key);
    } else {
      
      s3.deleteObject(params,(err,data)=>{
        if(err){
          console.log(err)
        }else{
          return true;
        }
      })
    }
  });
}
module.exports = {
  getSignUrl,s3, deleteImageAWS, Bucket
};