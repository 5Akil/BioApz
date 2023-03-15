var express = require('express')

var router = express.Router()
var multer = require('multer');
const multerS3 = require('multer-s3');
const uuidv1 = require('uuid/v1');
const moment = require('moment')
const awsConfig = require('../../config/aws_S3_config')
var commonConfig = require('../../config/common_config')

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public/profile_picture')
    },
    filename: function (req, file, cb) {
      // var fileExtension = file.mimetype.split('/')[1];
      // cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
      cb(null, `${file.originalname}`)
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

var awsupload = multer({
  storage:multerS3({
    fileFilter,
    s3:awsConfig.s3,
    bucket:awsConfig.Bucket,
    
    key:function(req,file,cb){
      const fileExt = file.originalname.split('.').pop(); // get file extension
      const randomString = Math.floor(Math.random() * 1000000); // generate random string
      const fileName = `${Date.now()}_${randomString}.${fileExt}`;
      cb(null,'profile_picture/'+fileName);
    }
  }),
  limits: {
    fileSize: commonConfig.maxFileSize,
  },
  fileFilter,
})

var controller = require('./user.controller')

const {verifyToken} = require('../../config/token');

router.post('/register', awsupload.single('profile_picture'),controller.Register)
router.post('/login', controller.Login)
router.post('/forgotPassword', controller.forgotPassword);
router.post('/otp-verification', controller.OtpVerify)
router.get('/resetPassword/:token', controller.GetResetPasswordForm);
router.post('/update-password/:token', controller.UpdatePassword)
router.get('/account-activation/:token', controller.AccountActivationByToken)
router.post('/get-profile', verifyToken, controller.GetProfileDetail)
router.post('/update-profile', verifyToken, awsupload.single('profile_picture'), controller.UpdateProfile)
router.post('/change-password', verifyToken, controller.ChangePassword)
router.post('/feedback', verifyToken, controller.SendFeedback)


module.exports = router;
