import React from 'react';
import type { NodeType } from '../../../../shared/types.js';

export interface NodeShapeProps {
  type: NodeType;
  cx: number;
  cy: number;
  r?: number;
  className?: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
}

export const NODE_SHAPE_DESCRIPTIONS: Record<NodeType, { shape: string; colorVar: string }> = {
  project: { shape: 'Circle', colorVar: 'var(--node-project)' },
  module: { shape: 'Circle', colorVar: 'var(--node-module)' },
  frontend: { shape: 'Rounded rectangle', colorVar: 'var(--node-frontend)' },
  backend: { shape: 'Rounded rectangle', colorVar: 'var(--node-backend)' },
  api: { shape: 'Hexagon', colorVar: 'var(--node-api)' },
  database: { shape: 'Cylinder', colorVar: 'var(--node-database)' },
  config: { shape: 'Diamond', colorVar: 'var(--node-config)' },
  test: { shape: 'Dashed rectangle', colorVar: 'var(--node-test)' },
};

export const NodeShape: React.FC<NodeShapeProps> = ({
  type,
  cx,
  cy,
  r = 20,
  className = '',
  fill,
  stroke,
  strokeWidth = 2,
  strokeDasharray,
}) => {
  const defaultFill = fill || NODE_SHAPE_DESCRIPTIONS[type]?.colorVar || 'var(--node-module)';
  const defaultStroke = stroke || 'var(--theme-surface)';

  switch (type) {
    case 'project':
    case 'module':
      return (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={defaultFill}
          stroke={defaultStroke}
          strokeWidth={strokeWidth}
          className={className}
        />
      );

    case 'frontend':
    case 'backend':
      return (
        <rect
          x={cx - r}
          y={cy - r * 0.75}
          width={r * 2}
          height={r * 1.5}
          rx={6}
          fill={defaultFill}
          stroke={defaultStroke}
          strokeWidth={strokeWidth}
          className={className}
        />
      );

    case 'api': {
      // 6 vertices of regular hexagon
      const points = [0, 1, 2, 3, 4, 5]
        .map((i) => {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          return `${px.toFixed(1)},${py.toFixed(1)}`;
        })
        .join(' ');
      return (
        <polygon
          points={points}
          fill={defaultFill}
          stroke={defaultStroke}
          strokeWidth={strokeWidth}
          className={className}
        />
      );
    }

    case 'database': {
      // 3D cylinder shape: top ellipse, body, bottom arc
      const w = r * 1.8;
      const h = r * 1.6;
      const ry = r * 0.35;
      const x = cx - w / 2;
      const y = cy - h / 2;
      return (
        <g className={className}>
          <path
            d={`M ${x} ${y + ry}
                v ${h - ry * 2}
                a ${w / 2} ${ry} 0 0 0 ${w} 0
                v -${h - ry * 2}
                Z`}
            fill={defaultFill}
            stroke={defaultStroke}
            strokeWidth={strokeWidth}
          />
          <ellipse
            cx={cx}
            cy={y + ry}
            rx={w / 2}
            ry={ry}
            fill={defaultFill}
            stroke={defaultStroke}
            strokeWidth={strokeWidth}
          />
        </g>
      );
    }

    case 'config': {
      // Diamond: 4 vertices
      const points = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
      return (
        <polygon
          points={points}
          fill={defaultFill}
          stroke={defaultStroke}
          strokeWidth={strokeWidth}
          className={className}
        />
      );
    }

    case 'test':
      return (
        <rect
          x={cx - r}
          y={cy - r * 0.75}
          width={r * 2}
          height={r * 1.5}
          rx={3}
          fill={defaultFill}
          stroke={defaultStroke}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray || '4 3'}
          className={className}
        />
      );

    default:
      return (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={defaultFill}
          stroke={defaultStroke}
          strokeWidth={strokeWidth}
          className={className}
        />
      );
  }
};
