
module.exports = (sequelize, DataTypes) => {
  const GiftCardTemplate = sequelize.define('gift_card_template', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    template_image: DataTypes.STRING,
    is_enable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    is_deleted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
  }, {
    // timestamps: false
  });
  GiftCardTemplate.associate = function(models) {
    // associations can be defined here
  };
  return GiftCardTemplate;
};