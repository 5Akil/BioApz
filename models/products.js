'use strict';
module.exports = (sequelize, DataTypes) => {
  const Products = sequelize.define('products', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
      type: DataTypes.INTEGER,
    },
    category_id: DataTypes.INTEGER,
    sub_category_id: DataTypes.INTEGER,
    name: DataTypes.STRING,
    price: DataTypes.DOUBLE,
    description: DataTypes.TEXT,
    product_item: {
      type: DataTypes.STRING,
      get() {
        return this.getDataValue('product_item') ? this.getDataValue('product_item') : ''
      },
    },
    image: {
      type: DataTypes.TEXT,
      get() {
        return this.getDataValue('image') ? this.getDataValue('image').split(';') : ''
      },
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    // timestamps: false
  });
  Products.associate = function (models) {
    // associations can be defined here
    Products.belongsTo(models.business, { foreignKey: 'business_id' })
    Products.belongsTo(models.product_categorys, { as: 'product_categorys', foreignKey: 'category_id' })
    Products.belongsTo(models.product_categorys, { as: 'sub_category', foreignKey: 'sub_category_id' })
    Products.hasMany(models.product_ratings, { foreignKey: 'product_id' })
    Products.hasMany(models.loyalty_points, {foreignKey: 'product_id'})
    Products.hasMany(models.order_details, { foreignKey: 'product_id' })
  };
  return Products;
};