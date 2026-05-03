class ProductRecommender {
  static weights = {
    total_buy: 4,
    rating: 4,
    price: 2
  };

  static getMinMax(products, key) {
    const values = products.map(p => p[key]);
    return {
      min: Math.min(...values),
      max: Math.max(...values)
    };
  }

  static normalize(value, min, max, isCost = false) {
    if (max - min === 0) return 0;

    if (isCost) {
      return (max - value) / (max - min);
    }
    return (value - min) / (max - min);
  }

  static calculateScores(products) {
    const buyMM = this.getMinMax(products, "total_buy");
    const ratingMM = this.getMinMax(products, "rating");
    const priceMM = this.getMinMax(products, "price");

    return products.map((p, index) => {
      const normBuy = this.normalize(p.total_buy, buyMM.min, buyMM.max);
      const normRating = this.normalize(p.rating, ratingMM.min, ratingMM.max);
      const normPrice = this.normalize(p.price, priceMM.min, priceMM.max, true);

      const score =
        normBuy * this.weights.total_buy +
        normRating * this.weights.rating +
        normPrice * this.weights.price;

      return {
        index,
        ...p,
        score
      };
    });
  }

  static rank(products) {
    return this.calculateScores(products)
      .sort((a, b) => b.score - a.score);
  }

  static getBest(products) {
    return this.rank(products)[0];
  }
}

module.exports = ProductRecommender;
