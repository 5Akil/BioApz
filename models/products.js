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
    sub_category_id : DataTypes.INTEGER,
    name: DataTypes.STRING,
    price: DataTypes.DOUBLE,
    description: DataTypes.TEXT,
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
  Products.associate = function(models) {
    // associations can be defined here
    Products.belongsTo(models.business, {foreignKey: 'business_id'})
    Products.belongsTo(models.product_categorys,{foreignKey:'category_id'})
  };
  return Products;
};