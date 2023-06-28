'use strict';
module.exports = (sequelize, DataTypes) => {
  const ProductRating = sequelize.define('product_ratings', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    user_id: {
        type: DataTypes.INTEGER,
    },
    product_id: DataTypes.INTEGER,
    ratings : DataTypes.INTEGER,
    description: DataTypes.TEXT,
    
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    is_review_report: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },

    report_description: {
      type: DataTypes.TEXT,
      defaultValue: ''
    },
  }, {
    // timestamps: false
  });
  ProductRating.associate = function(models) {
    // associations can be defined here
    ProductRating.belongsTo(models.products, {foreignKey: 'product_id'})
    ProductRating.belongsTo(models.user,{foreignKey:'user_id'})
   
  };
  return ProductRating;
};