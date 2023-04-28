var express = require('express')

var router = express.Router()

var multer = require('multer');
const multerS3 = require('multer-s3');

const uuidv1 = require('uuid/v1');
const moment = require('moment')
var awsConfig = require('../../config/aws_S3_config')
var commonConfig = require('../../config/common_config')

var storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, 'public/products')
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

var categoryawsupload = multer({
  storage:multerS3({
    s3:awsConfig.s3,
    bucket:awsConfig.Bucket,
    
    key:function(req,file,cb){
      const fileExt = file.originalname.split('.').pop(); // get file extension
      const randomString = Math.floor(Math.random() * 1000000); // generate random string
      const fileName = `${Date.now()}_${randomString}.${fileExt}`;
      cb(null,'product_category/'+fileName);
    }
  }),
  limits: {
    fileSize: commonConfig.maxFileSize,
  },
  fileFilter,
})
var controller = require('./product.controller')
const uploadImage = multer({ dest: 'products/' });
const {verifyToken} = require('../../config/token');

router.post('/inquiry', verifyToken, controller.createInquiry)
router.post('/getAll', verifyToken, controller.GetAllProducts)
router.post('/getBooking', verifyToken, controller.GetBookingInquiry)
router.post('/isRead', verifyToken, controller.IsReadStatus)
router.post('/creatProduct', verifyToken, uploadImage.array('image'), controller.createProduct)
router.post('/updateProduct', verifyToken, uploadImage.array('image'), controller.UpdateProductDetail)
router.post('/removeImage',verifyToken,controller.RemoveProductImage)


// router.post('/initChat', verifyToken, controller.ChatInitialize)
router.get('/byId/:id', verifyToken, controller.GetProductById)

router.post('/createCategory',verifyToken, categoryawsupload.single('image'), controller.CreateCategory)
router.post('/category-list/',verifyToken,controller.CategoryList)
router.get('/categoryById/:id',verifyToken,controller.GetCategoryById)
router.post('/updateCategory',verifyToken,categoryawsupload.single('image'), controller.UpdateCategory)
router.delete('/removeCategory/:id',verifyToken, controller.RemoveCategory)

router.post('/productTypeList',verifyToken,controller.ProductTypeList)
router.delete('/removeProductType/:id',verifyToken,controller.removeProductType)

router.post('/add-product-ratings',verifyToken,controller.AddProductRattings)
router.post('/get-product-ratings',verifyToken,controller.GetProductRattings)
module.exports = router;
