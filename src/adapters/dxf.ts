import { CadDocument, CadEntity } from '../core/cad/types';
import { Point2D } from '../core/survey/coordinates';

function pair(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

export function exportDocumentToDxf(doc: CadDocument): string {
  let out = '';
  // HEADER
  out += pair(0, 'SECTION');
  out += pair(2, 'HEADER');
  out += pair(9, '$ACADVER');
  out += pair(1, 'AC1015');
  out += pair(9, '$INSUNITS');
  out += pair(70, 2); // 2 = Feet
  out += pair(0, 'ENDSEC');

  // TABLES
  out += pair(0, 'SECTION');
  out += pair(2, 'TABLES');
  out += pair(0, 'TABLE');
  out += pair(2, 'LAYER');
  out += pair(70, 1);
  out += pair(0, 'LAYER');
  out += pair(2, '0');
  out += pair(70, 0);
  out += pair(62, 7);
  out += pair(6, 'CONTINUOUS');
  out += pair(0, 'ENDTAB');
  out += pair(0, 'ENDSEC');

  // ENTITIES
  out += pair(0, 'SECTION');
  out += pair(2, 'ENTITIES');

  for (const entity of doc.entities) {
    if (entity.visible === false) continue;
    const layer = entity.layer || '0';
    switch (entity.kind) {
      case 'line': {
        out += pair(0, 'LINE');
        out += pair(8, layer);
        out += pair(10, entity.start.x.toFixed(6));
        out += pair(20, entity.start.y.toFixed(6));
        out += pair(30, 0);
        out += pair(11, entity.end.x.toFixed(6));
        out += pair(21, entity.end.y.toFixed(6));
        out += pair(31, 0);
        break;
      }
      case 'polyline':
      case 'polygon':
      case 'rectangle': {
        const closed =
          entity.kind === 'polygon' || entity.kind === 'rectangle'
            ? true
            : entity.closed;
        out += pair(0, 'LWPOLYLINE');
        out += pair(8, layer);
        out += pair(90, entity.points.length);
        out += pair(70, closed ? 1 : 0);
        for (const p of entity.points) {
          out += pair(10, p.x.toFixed(6));
          out += pair(20, p.y.toFixed(6));
        }
        break;
      }
      case 'circle': {
        out += pair(0, 'CIRCLE');
        out += pair(8, layer);
        out += pair(10, entity.center.x.toFixed(6));
        out += pair(20, entity.center.y.toFixed(6));
        out += pair(30, 0);
        out += pair(40, entity.radiusFt.toFixed(6));
        break;
      }
      case 'arc': {
        const startDeg = ((entity.startAngleRad * 180) / Math.PI + 360) % 360;
        const endDeg = ((entity.endAngleRad * 180) / Math.PI + 360) % 360;
        const a1 = entity.anticlockwise === false ? endDeg : startDeg;
        const a2 = entity.anticlockwise === false ? startDeg : endDeg;
        out += pair(0, 'ARC');
        out += pair(8, layer);
        out += pair(10, entity.center.x.toFixed(6));
        out += pair(20, entity.center.y.toFixed(6));
        out += pair(30, 0);
        out += pair(40, entity.radiusFt.toFixed(6));
        out += pair(50, a1.toFixed(4));
        out += pair(51, a2.toFixed(4));
        break;
      }
      case 'point': {
        out += pair(0, 'POINT');
        out += pair(8, layer);
        out += pair(10, entity.position.x.toFixed(6));
        out += pair(20, entity.position.y.toFixed(6));
        out += pair(30, 0);
        break;
      }
      case 'text': {
        out += pair(0, 'TEXT');
        out += pair(8, layer);
        out += pair(10, entity.position.x.toFixed(6));
        out += pair(20, entity.position.y.toFixed(6));
        out += pair(30, 0);
        out += pair(40, entity.heightFt.toFixed(4));
        out += pair(1, entity.text.replace(/\r?\n/g, ' '));
        break;
      }
      case 'dimension': {
        out += pair(0, 'LINE');
        out += pair(8, `${layer}_DIM`);
        out += pair(10, entity.start.x.toFixed(6));
        out += pair(20, entity.start.y.toFixed(6));
        out += pair(30, 0);
        out += pair(11, entity.end.x.toFixed(6));
        out += pair(21, entity.end.y.toFixed(6));
        out += pair(31, 0);
        break;
      }
    }
  }

  out += pair(0, 'ENDSEC');
  out += pair(0, 'EOF');
  return out;
}

export function importDxfToEntities(dxfText: string): CadEntity[] {
  const lines = dxfText.replace(/\r\n/g, '\n').split('\n');
  const pairs: Array<{ code: number; val: string }> = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    const val = lines[i + 1].trim();
    if (!Number.isNaN(code)) {
      pairs.push({ code, val });
    }
  }

  const entities: CadEntity[] = [];
  let inEntities = false;
  let i = 0;
  let seq = 1;

  while (i < pairs.length) {
    const { code, val } = pairs[i];
    if (code === 0 && val === 'SECTION') {
      if (i + 1 < pairs.length && pairs[i + 1].code === 2 && pairs[i + 1].val === 'ENTITIES') {
        inEntities = true;
        i += 2;
        continue;
      }
    }
    if (code === 0 && val === 'ENDSEC') {
      inEntities = false;
    }

    if (inEntities && code === 0) {
      const entityType = val;
      i++;
      const props: Array<{ code: number; val: string }> = [];
      while (i < pairs.length && pairs[i].code !== 0) {
        props.push(pairs[i]);
        i++;
      }

      const getNum = (c: number, def = 0) => {
        const found = props.find((p) => p.code === c);
        return found ? Number(found.val) || def : def;
      };
      const getStr = (c: number, def = '') => {
        const found = props.find((p) => p.code === c);
        return found ? found.val : def;
      };
      const layer = getStr(8, '0');
      const id = `dxf-${Date.now()}-${seq++}`;

      if (entityType === 'LINE') {
        entities.push({
          id,
          kind: 'line',
          layer,
          color: '#0F5132',
          start: { x: getNum(10), y: getNum(20) },
          end: { x: getNum(11), y: getNum(21) },
        });
      } else if (entityType === 'CIRCLE') {
        entities.push({
          id,
          kind: 'circle',
          type: 'CIRCLE',
          layer,
          color: '#0F5132',
          center: { x: getNum(10), y: getNum(20) },
          radiusFt: Math.max(0.01, getNum(40, 10)),
        });
      } else if (entityType === 'ARC') {
        const startAngleRad = (getNum(50, 0) * Math.PI) / 180;
        const endAngleRad = (getNum(51, 90) * Math.PI) / 180;
        entities.push({
          id,
          kind: 'arc',
          type: 'ARC',
          layer,
          color: '#0F5132',
          center: { x: getNum(10), y: getNum(20) },
          radiusFt: Math.max(0.01, getNum(40, 10)),
          startAngleRad,
          endAngleRad,
          anticlockwise: true,
        });
      } else if (entityType === 'POINT') {
        entities.push({
          id,
          kind: 'point',
          layer,
          color: '#B45309',
          position: { x: getNum(10), y: getNum(20) },
          marker: 'pillar',
        });
      } else if (entityType === 'TEXT' || entityType === 'MTEXT') {
        entities.push({
          id,
          kind: 'text',
          layer,
          color: '#1E293B',
          position: { x: getNum(10), y: getNum(20) },
          heightFt: Math.max(1, getNum(40, 4)),
          text: getStr(1, ''),
        });
      } else if (entityType === 'LWPOLYLINE') {
        const pts: Point2D[] = [];
        let curX: number | null = null;
        for (const p of props) {
          if (p.code === 10) curX = Number(p.val);
          else if (p.code === 20 && curX !== null) {
            pts.push({ x: curX, y: Number(p.val) });
            curX = null;
          }
        }
        const closed = (getNum(70, 0) & 1) === 1;
        if (pts.length >= 3 && closed) {
          entities.push({
            id,
            kind: 'polygon',
            layer,
            color: '#0F5132',
            points: pts,
            fillOpacity: 0.14,
          });
        } else if (pts.length >= 2) {
          entities.push({
            id,
            kind: 'polyline',
            layer,
            color: '#0F5132',
            points: pts,
            closed,
          });
        }
      }
      continue;
    }
    i++;
  }

  return entities;
}
