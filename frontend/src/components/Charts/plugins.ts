export const centerTextPlugin = {
  id: 'centerTextPlugin',
  beforeDraw: (chart: any) => {
    const { ctx } = chart;
    const customText = chart.config.options.customCenterText;
    if (!customText) return;

    const meta = chart.getDatasetMeta(0);
    if (!meta || !meta.data || !meta.data[0]) return;

    const x = meta.data[0].x;
    const y = meta.data[0].y;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '600 10px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(customText.title, x, y - 10);

    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.fillStyle = customText.color;
    ctx.fillText(customText.value, x, y + 10);

    ctx.restore();
  },
};