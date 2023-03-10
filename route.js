module.exports = function (app) {
  app.use('/api/common', require('./api/common'))
  app.use('/api/user', require('./api/user'))
  app.use('/api/business', require('./api/business'))
  app.use('/api/product', require('./api/product'))
  app.use('/api/calendar', require('./api/calendar'))
  app.use('/api/promo', require('./api/promos'))
  app.use('/api/gift-card-template', require('./api/gift-card'))
  app.use('/api/shopping-cart', require('./api/shopping-cart'))
  app.use('/api/wishlist', require('./api/wishlist'))
  app.use('/api/order', require('./api/order'))
  
}
