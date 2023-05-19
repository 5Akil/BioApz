var express = require('express')
var router = express.Router()
var multer = require('multer');
const multerS3 = require('multer-s3');
const uuidv1 = require('uuid/v1');
const moment = require('moment')
var awsConfig = require('../../config/aws_S3_config')
var commonConfig = require('../../config/common_config')
const {verifyToken} = require('../../config/token');

var storage = multer.diskStorage({ 
    destination: function (req, file, cb) {
      cb(null, 'public/')
    },
    filename: function (req, file, cb) {
      var fileExtension = file.mimetype.split('/')[1];
      cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
    }
})
  
var upload = multer({ storage: storage });

//upload image in AWS S3
const fileFilter = (req,file,cb) => {
  if(file.mimetype === 'image/jpeg' || file.mimetype === 'image/png'){
    cb(null,true)
  }else{
    cb(new Error('You can upload only jpg, jpeg, png, gif files'),false);
  }
}
// Gift Cards Section START
var controller = require('./rewards.controller')

var giftcardawsupload = multer({
  storage:multerS3({
    s3:awsConfig.s3,
    bucket:awsConfig.Bucket,
    
    key:function(req,file,cb){
      const fileExt = file.originalname.split('.').pop(); // get file extension
      const randomString = Math.floor(Math.random() * 1000000); // generate random string
      const fileName = `${Date.now()}_${randomString}.${fileExt}`;
      cb(null,'gift-cards/'+fileName);
    }
  }),
  limits: {
    fileSize: commonConfig.maxFileSize,
  },
  fileFilter,
})



// Common
router.post('/list', verifyToken, controller.giftCardList)

// Gift Card Routes
router.post('/gift-cards/create', verifyToken, giftcardawsupload.single('image'), controller.giftCardCreate)
router.delete('/gift-cards/delete/:id', verifyToken, controller.deleteGiftCard)
router.get('/gift-cards/view/:id',verifyToken,controller.giftCardView)
router.post('/gift-cards/update',verifyToken,giftcardawsupload.single('image'), controller.giftCardUpdate)
// Gift Cards Section END

// Cashbacks Section START
router.post('/cashbacks/create', verifyToken, controller.cashbackCreate)
// Cashbacks Section END
module.exports = router;
