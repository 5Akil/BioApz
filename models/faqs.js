'use strict';
module.exports = (sequelize, DataTypes) => {
  const Faq = sequelize.define('faqs', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    business_id: {
        type: DataTypes.INTEGER,
    },
    title: DataTypes.TEXT,
    description : DataTypes.TEXT,
    is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
  }, {
    // timestamps: false
  });
  Faq.associate = function(models) {
    // associations can be defined here
    Faq.belongsTo(models.business, {foreignKey: 'business_id'})
  };
  return Faq;
};