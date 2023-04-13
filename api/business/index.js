var express = require('express')

var router = express.Router()
var multer = require('multer');
const multerS3 = require('multer-s3');
const uuidv1 = require('uuid/v1');
const moment = require('moment')
const awsConfig = require('../../config/aws_S3_config')
var commonConfig = require('../../config/common_config')

var companyImages = multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, 'public/business_gallery')
      },
      filename: function (req, file, cb) {
        var fileExtension = file.mimetype.split('/')[1];
        cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
      }
    })
})

var upload =  multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, 'public/offers')
      },
      filename: function (req, file, cb) {
        var fileExtension = file.mimetype.split('/')[1];
        cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
      }
    })
})

var banner =  multer({
    storage: multer.diskStorage({
      destination: function (req, file, cb) {
        cb(null, 'public/banners')
      },
      filename: function (req, file, cb) {
        // var fileExtension = file.mimetype.split('/')[1];
        // cb(null, `${uuidv1()}_${moment().unix()}.${fileExtension}`)
        cb(null, `${file.originalname}`)
      }
    })
})

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
      cb(null,'offers/'+fileName);
    }
  }),
  limits: {
    fileSize: commonConfig.maxFileSize,
  },
  fileFilter,
})

var awsuploadcompanyImages = multer({
  storage:multerS3({
    s3:awsConfig.s3,
    bucket:awsConfig.Bucket,
    
    key:function(req,file,cb){
      const fileExt = file.originalname.split('.').pop(); // get file extension
      const randomString = Math.floor(Math.random() * 1000000); // generate random string
      const fileName = `${Date.now()}_${randomString}.${fileExt}`;
     cb(null,'business_gallery/'+req.body.business_id+'/'+fileName);
    }
  }),
  limits: {
    fileSize: commonConfig.maxFileSize,
  },
  fileFilter,
})

var awsuploadbanner = multer({
  storage:multerS3({
    fileFilter,
    s3:awsConfig.s3,
    bucket:awsConfig.Bucket,
    
    key:function(req,file,cb){
      const fileExt = file.originalname.split('.').pop(); // get file extension
      const randomString = Math.floor(Math.random() * 1000000); // generate random string
      const fileName = `${Date.now()}_${randomString}.${fileExt}`;
      cb(null,'banners/'+fileName);
    }
  }),
  limits: {
    fileSize: commonConfig.maxFileSize,
  },
  fileFilter,
})
var controller = require('./business.controller')

const {verifyToken} = require('../../config/token');

const uploadImage = multer({ dest: 'business_gallery/' });

router.post('/inquiry', verifyToken, controller.createInquiry)
router.post('/recommended', verifyToken, controller.GetRecommendedBusiness)
router.post('/getBusinessDetail', verifyToken, controller.GetBusinessDetail);
router.post('/updateBusinessDetail', verifyToken, awsuploadbanner.single('banner'), controller.UpdateBusinessDetail)
router.post('/getImages', verifyToken, controller.GetImages);
router.post('/uploadImages', verifyToken, awsuploadcompanyImages.array('images'), controller.UploadCompanyImages)
router.post('/getAll', verifyToken, controller.GetAllOffers)
router.post('/updateOffers', verifyToken, awsupload.single('image'), controller.UpdateOfferDetail)
router.post('/banner_booking', verifyToken , awsuploadbanner.single('banner'), controller.ManageBannerAndBooking);
router.get('/category-list',controller.GetCategory)
router.post('/register', awsuploadbanner.single('banner'),controller.CreateBusiness)
router.post('/initChat', verifyToken, controller.ChatInitialize)
router.get('/get-profile/:id',verifyToken,controller.GetProfile)
router.post('/change-password',verifyToken,controller.ChangePassword)

router.post('/createOffer', verifyToken, awsupload.single('image'), controller.CreateOffer)
router.post('/updateOffer', verifyToken, awsupload.single('image'), controller.UpdateOffer)
router.post('/getOffers', verifyToken, controller.GetOffers)
//booking api for react restaurants templates
router.post('/restaurants-booking', verifyToken, controller.RestaurantsBooking)

module.exports = router;
