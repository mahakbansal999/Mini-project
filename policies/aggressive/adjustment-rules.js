module.exports = {
    adjust: (metrics) => {
        return metrics.cpu > 80 ? 0.5 : 1.0;
    }
};
