var express = require('express')

var router = express.Router()
var multer = require('multer');
const multerS3 = require('multer-s3');
const uuidv1 = require('uuid/v1');
const moment = require('moment')
const fs = require('fs')
const awsConfig = require('../../config/aws_S3_config')
var commonConfig = require('../../config/common_config')

var upload =  multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {

        if (!fs.existsSync('public/promos')){
          fs.mkdirSync('public/promos');
        }
        cb(null, 'public/promos')
      },
      filename: function (req, file, cb) {
        var fileExtension = file.mimetype.split('/')[1];
        cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
      }
    })
})
//upload image in AWS S3
const fileFilter = (req,file,cb) => {

  if(file.mimetype === 'image/jpeg' || file.mimetype === 'image/png'){
    cb(null,true)
  }else{
    cb(new Error('You can upload only jpg, jpeg, png, gif files'),false);
  }
}

var awsupload = multer({
  storage:multerS3({
    s3:awsConfig.s3,
    bucket:awsConfig.Bucket,
    
    key:function(req,file,cb){
      const fileExt = file.originalname.split('.').pop(); // get file extension
      const randomString = Math.floor(Math.random() * 1000000); // generate random string
      const fileName = `${Date.now()}_${randomString}.${fileExt}`;
      cb(null,'promos/'+fileName);
    }
  }),
  limits: {
    fileSize: commonConfig.maxFileSize, // 5 MB limit
  },
  fileFilter,
});

var controller = require('./promos.controller')

const {verifyToken} = require('../../config/token');

router.post('/create', verifyToken, awsupload.single('image'), controller.CreatePromo)
router.post('/update', verifyToken, awsupload.single('image'), controller.UpdatePromo)
router.post('/getAll', verifyToken, controller.GetPromos)

module.exports = router;
