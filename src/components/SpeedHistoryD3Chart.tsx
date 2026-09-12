import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Activity, Gauge, Eye, EyeOff, RotateCcw, Zap } from 'lucide-react';
import { DownloadItem } from '../types';
import { AccentColor, getAccentTheme } from '../services/accentTheme';

export interface SpeedHistoryD3ChartProps {
  items: DownloadItem[];
  aggregateSpeedBytesPerSec: number;
  darkMode: boolean;
  accentColor?: AccentColor;
}

interface SpeedDataPoint {
  timestamp: number;
  timeOffset: number; // 0 is now, -60 is 60s ago
  aggregateSpeed: number; // in current unit (Mbps or MB/s)
  itemSpeeds: Record<string, number>;
}

const PALETTE = [
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#3b82f6', // blue
  '#f97316', // orange
  '#14b8a6', // teal
];

export const SpeedHistoryD3Chart: React.FC<SpeedHistoryD3ChartProps> = ({
  items,
  aggregateSpeedBytesPerSec,
  darkMode,
  accentColor = 'cyan',
}) => {
  const theme = getAccentTheme(accentColor);
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [unit, setUnit] = useState<'mbps' | 'mbs'>('mbps');
  const [showIndividual, setShowIndividual] = useState(true);
  const [showAggregate, setShowAggregate] = useState(true);
  const [hoveredPoint, setHoveredPoint] = useState<SpeedDataPoint | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Maintain 60-second historical buffer
  const historyBufferRef = useRef<SpeedDataPoint[]>([]);

  // Assign stable colors to download items
  const itemColorMapRef = useRef<Map<string, string>>(new Map());

  // Active items currently downloading or with speed > 0
  const activeItems = items.filter(
    (i) => i.status === 'downloading' || i.status === 'resuming' || (i.speedBytesPerSec && i.speedBytesPerSec > 0)
  );

  // Update color map
  activeItems.forEach((item, idx) => {
    if (!itemColorMapRef.current.has(item.id)) {
      const color = PALETTE[itemColorMapRef.current.size % PALETTE.length];
      itemColorMapRef.current.set(item.id, color);
    }
  });

  // Convert bytes per second to target unit
  const toUnitSpeed = (bytesPerSec: number): number => {
    if (unit === 'mbps') {
      return (bytesPerSec * 8) / (1024 * 1024);
    }
    return bytesPerSec / (1024 * 1024);
  };

  // Record historical sample every 1 second
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const currentAggSpeed = toUnitSpeed(aggregateSpeedBytesPerSec);

      const currentItemSpeeds: Record<string, number> = {};
      items.forEach((item) => {
        if (item.status === 'downloading' || item.status === 'resuming') {
          currentItemSpeeds[item.id] = toUnitSpeed(item.speedBytesPerSec || 0);
        }
      });

      const newPoint: SpeedDataPoint = {
        timestamp: now,
        timeOffset: 0,
        aggregateSpeed: currentAggSpeed,
        itemSpeeds: currentItemSpeeds,
      };

      const prev = historyBufferRef.current;
      // Recalculate time offsets relative to now (0 to -60)
      const updated = [...prev, newPoint]
        .filter((pt) => now - pt.timestamp <= 61000)
        .map((pt) => ({
          ...pt,
          timeOffset: Math.round((pt.timestamp - now) / 1000),
        }));

      historyBufferRef.current = updated;
      drawChart();
    }, 1000);

    return () => clearInterval(interval);
  }, [aggregateSpeedBytesPerSec, items, unit, showIndividual, showAggregate, darkMode]);

  // Initial populate with 60 dummy zero points if buffer is empty
  useEffect(() => {
    if (historyBufferRef.current.length === 0) {
      const now = Date.now();
      const initial: SpeedDataPoint[] = [];
      for (let i = 60; i >= 0; i--) {
        initial.push({
          timestamp: now - i * 1000,
          timeOffset: -i,
          aggregateSpeed: i === 0 ? toUnitSpeed(aggregateSpeedBytesPerSec) : 0,
          itemSpeeds: {},
        });
      }
      historyBufferRef.current = initial;
      drawChart();
    }
  }, []);

  // Responsive D3 drawing function
  const drawChart = () => {
    if (!svgRef.current || !containerRef.current) return;

    const data = historyBufferRef.current;
    if (data.length === 0) return;

    const containerWidth = containerRef.current.clientWidth || 600;
    const width = Math.max(320, containerWidth);
    const height = 220;

    const margin = { top: 16, right: 24, bottom: 28, left: 48 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('width', '100%').attr('height', height);

    // Defs for gradients
    const defs = svg.append('defs');

    // Aggregate area gradient
    const aggGradient = defs
      .append('linearGradient')
      .attr('id', 'agg-speed-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    aggGradient.append('stop').attr('offset', '0%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.28);
    aggGradient.append('stop').attr('offset', '80%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0.04);
    aggGradient.append('stop').attr('offset', '100%').attr('stop-color', '#06b6d4').attr('stop-opacity', 0);

    // X Scale: -60s to 0s
    const xScale = d3
      .scaleLinear()
      .domain([-60, 0])
      .range([margin.left, width - margin.right]);

    // Y Scale: 0 to Max Speed with 20% headroom
    const maxAgg = Number(d3.max(data, (d: SpeedDataPoint) => d.aggregateSpeed)) || 0;
    let maxInd = 0;
    data.forEach((d) => {
      Object.values(d.itemSpeeds).forEach((sp: number) => {
        if (sp > maxInd) maxInd = sp;
      });
    });
    const maxVal = Math.max(maxAgg, maxInd, unit === 'mbps' ? 10 : 2);
    const yScale = d3
      .scaleLinear()
      .domain([0, maxVal * 1.2])
      .nice()
      .range([height - margin.bottom, margin.top]);

    // Gridlines
    const yGrid = d3
      .axisLeft(yScale)
      .ticks(4)
      .tickSize(-innerWidth)
      .tickFormat(() => '');

    svg
      .append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(yGrid)
      .selectAll('line')
      .attr('stroke', darkMode ? '#27272a' : '#f1f5f9')
      .attr('stroke-dasharray', '3,3');

    svg.select('.grid .domain').remove();

    // X Axis
    const xAxis = d3
      .axisBottom(xScale)
      .tickValues([-60, -45, -30, -15, 0])
      .tickFormat((d) => (d === 0 ? 'Now' : `${d}s`));

    const gx = svg
      .append('g')
      .attr('transform', `translate(0, ${height - margin.bottom})`)
      .call(xAxis);

    gx.selectAll('text')
      .attr('fill', darkMode ? '#a1a1aa' : '#64748b')
      .attr('font-size', '10px')
      .attr('font-family', 'ui-monospace, monospace');

    gx.selectAll('line').attr('stroke', darkMode ? '#3f3f46' : '#cbd5e1');
    gx.select('.domain').attr('stroke', darkMode ? '#3f3f46' : '#cbd5e1');

    // Y Axis
    const yAxis = d3
      .axisLeft(yScale)
      .ticks(4)
      .tickFormat((d) => `${d} ${unit === 'mbps' ? 'M' : 'MB'}`);

    const gy = svg
      .append('g')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(yAxis);

    gy.selectAll('text')
      .attr('fill', darkMode ? '#a1a1aa' : '#64748b')
      .attr('font-size', '10px')
      .attr('font-family', 'ui-monospace, monospace');

    gy.selectAll('line').attr('stroke', darkMode ? '#3f3f46' : '#cbd5e1');
    gy.select('.domain').attr('stroke', darkMode ? '#3f3f46' : '#cbd5e1');

    // Individual item lines
    if (showIndividual) {
      activeItems.forEach((item) => {
        const color = itemColorMapRef.current.get(item.id) || '#10b981';
        const lineGenerator = d3
          .line<SpeedDataPoint>()
          .x((d) => xScale(d.timeOffset))
          .y((d) => yScale(d.itemSpeeds[item.id] || 0))
          .curve(d3.curveMonotoneX);

        svg
          .append('path')
          .datum(data)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', 1.6)
          .attr('stroke-dasharray', '4,2')
          .attr('opacity', 0.85)
          .attr('d', lineGenerator);
      });
    }

    // Aggregate Area and Line
    if (showAggregate) {
      const areaGenerator = d3
        .area<SpeedDataPoint>()
        .x((d) => xScale(d.timeOffset))
        .y0(height - margin.bottom)
        .y1((d) => yScale(d.aggregateSpeed))
        .curve(d3.curveMonotoneX);

      svg
        .append('path')
        .datum(data)
        .attr('fill', 'url(#agg-speed-gradient)')
        .attr('d', areaGenerator);

      const aggLineGenerator = d3
        .line<SpeedDataPoint>()
        .x((d) => xScale(d.timeOffset))
        .y((d) => yScale(d.aggregateSpeed))
        .curve(d3.curveMonotoneX);

      svg
        .append('path')
        .datum(data)
        .attr('fill', 'none')
        .attr('stroke', '#06b6d4')
        .attr('stroke-width', 2.4)
        .attr('d', aggLineGenerator);

      // Latest pulsating point
      const lastPoint = data[data.length - 1];
      if (lastPoint) {
        const lastX = xScale(0);
        const lastY = yScale(lastPoint.aggregateSpeed);

        svg
          .append('circle')
          .attr('cx', lastX)
          .attr('cy', lastY)
          .attr('r', 4)
          .attr('fill', '#06b6d4');

        svg
          .append('circle')
          .attr('cx', lastX)
          .attr('cy', lastY)
          .attr('r', 8)
          .attr('fill', '#06b6d4')
          .attr('opacity', 0.35)
          .attr('class', 'animate-ping');
      }
    }

    // Invisible Overlay for Mouse/Touch Tracking
    const bisect = d3.bisector<SpeedDataPoint, number>((d) => d.timeOffset).center;

    svg
      .append('rect')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .attr('transform', `translate(${margin.left}, ${margin.top})`)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove touchmove', function (event) {
        const [mx] = d3.pointer(event);
        const mouseX = mx + margin.left;
        const timeVal = xScale.invert(mouseX);
        const idx = bisect(data, timeVal);
        const point = data[idx];

        if (point) {
          setHoveredPoint(point);
          const px = xScale(point.timeOffset);
          const py = yScale(point.aggregateSpeed);
          setHoverPos({ x: px, y: py });
        }
      })
      .on('mouseleave touchend', function () {
        setHoveredPoint(null);
        setHoverPos(null);
      });
  };

  // Resize listener
  useEffect(() => {
    const handleResize = () => drawChart();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [unit, showIndividual, showAggregate, darkMode]);

  const resetHistory = () => {
    const now = Date.now();
    const initial: SpeedDataPoint[] = [];
    for (let i = 60; i >= 0; i--) {
      initial.push({
        timestamp: now - i * 1000,
        timeOffset: -i,
        aggregateSpeed: 0,
        itemSpeeds: {},
      });
    }
    historyBufferRef.current = initial;
    drawChart();
  };

  const currentAgg = toUnitSpeed(aggregateSpeedBytesPerSec);

  return (
    <div
      id="speed-history-d3-container"
      ref={containerRef}
      className={`p-4 rounded-2xl border transition-all ${
        darkMode ? 'bg-zinc-900/90 border-zinc-800 text-zinc-100 shadow-md' : 'bg-white border-slate-200 text-slate-800 shadow-sm'
      }`}
    >
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
            <Activity className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-xs sm:text-sm">Real-time Transfer Speed (Last 60 Seconds)</h4>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                D3 Real-time
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              Live telemetry tracking aggregate throughput & multi-stream connections
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Unit Toggle */}
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-zinc-700 p-0.5 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setUnit('mbps')}
              className={`px-2 py-0.5 rounded ${
                unit === 'mbps'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Mbps
            </button>
            <button
              type="button"
              onClick={() => setUnit('mbs')}
              className={`px-2 py-0.5 rounded ${
                unit === 'mbs'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              MB/s
            </button>
          </div>

          {/* Toggle Aggregate */}
          <button
            type="button"
            onClick={() => setShowAggregate(!showAggregate)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
              showAggregate
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-600 dark:text-cyan-400'
                : 'bg-slate-100 dark:bg-zinc-800 border-transparent text-slate-400'
            }`}
            title="Toggle Aggregate Speed Line"
          >
            {showAggregate ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            <span>Aggregate</span>
          </button>

          {/* Toggle Individual */}
          {activeItems.length > 0 && (
            <button
              type="button"
              onClick={() => setShowIndividual(!showIndividual)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
                showIndividual
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                  : 'bg-slate-100 dark:bg-zinc-800 border-transparent text-slate-400'
              }`}
              title="Toggle Individual Stream Lines"
            >
              {showIndividual ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              <span>Individual ({activeItems.length})</span>
            </button>
          )}

          {/* Reset Chart */}
          <button
            type="button"
            onClick={resetHistory}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
            title="Clear 60s history buffer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative">
        <svg ref={svgRef} className="w-full overflow-visible select-none"></svg>

        {/* Hover Crosshair Marker & Tooltip */}
        {hoveredPoint && hoverPos && (
          <div
            className="absolute pointer-events-none z-10 px-3 py-2 rounded-xl text-xs shadow-xl border backdrop-blur-md transition-transform"
            style={{
              left: Math.min(Math.max(hoverPos.x - 70, 10), (containerRef.current?.clientWidth || 400) - 170),
              top: Math.max(hoverPos.y - 75, 5),
              backgroundColor: darkMode ? 'rgba(24, 24, 27, 0.95)' : 'rgba(255, 255, 255, 0.95)',
              borderColor: darkMode ? 'rgba(63, 63, 70, 0.8)' : 'rgba(226, 232, 240, 0.8)',
            }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-zinc-800 pb-1 mb-1 font-mono text-[10px] text-slate-400">
              <span>{hoveredPoint.timeOffset === 0 ? 'Current Live' : `${Math.abs(hoveredPoint.timeOffset)}s ago`}</span>
              <span className="font-bold text-cyan-500">
                {hoveredPoint.aggregateSpeed.toFixed(2)} {unit === 'mbps' ? 'Mbps' : 'MB/s'}
              </span>
            </div>

            {Object.keys(hoveredPoint.itemSpeeds).length > 0 ? (
              <div className="space-y-0.5 max-h-24 overflow-y-auto">
                {Object.entries(hoveredPoint.itemSpeeds).map(([itemId, sp]) => {
                  const item = items.find((i) => i.id === itemId);
                  const color = itemColorMapRef.current.get(itemId) || '#10b981';
                  return (
                    <div key={itemId} className="flex items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="truncate max-w-[110px]">{item?.title || 'Stream'}</span>
                      </div>
                      <span className="font-mono font-semibold" style={{ color }}>
                        {Number(sp).toFixed(2)} {unit === 'mbps' ? 'M' : 'MB'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-[10px] text-slate-400 italic">No individual streams active</div>
            )}
          </div>
        )}
      </div>

      {/* Stream Legends & Current Speed Ticker */}
      <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between flex-wrap gap-2 text-[11px]">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Aggregate Legend */}
          <div className="flex items-center gap-1.5 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/50" />
            <span className="text-slate-700 dark:text-zinc-300">Aggregate Bandwidth:</span>
            <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
              {currentAgg.toFixed(2)} {unit === 'mbps' ? 'Mbps' : 'MB/s'}
            </span>
          </div>

          {/* Individual Items Legend */}
          {activeItems.map((item) => {
            const color = itemColorMapRef.current.get(item.id) || '#10b981';
            const sp = toUnitSpeed(item.speedBytesPerSec || 0);
            return (
              <div key={item.id} className="flex items-center gap-1.5 text-slate-600 dark:text-zinc-400">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="truncate max-w-[120px]">{item.title}</span>
                <span className="font-mono font-semibold" style={{ color }}>
                  {sp.toFixed(1)} {unit === 'mbps' ? 'M' : 'MB'}
                </span>
              </div>
            );
          })}
        </div>

        <span className="text-[10px] text-slate-400 font-mono">Window: 60s • Rate: 1Hz</span>
      </div>
    </div>
  );
};
