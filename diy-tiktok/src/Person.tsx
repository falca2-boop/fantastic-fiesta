/**
 * Animated SVG human figure.
 * All positions in an internal 200×400 coordinate space.
 * Use `scale` + CSS translate to place in scene.
 */

type PersonProps = {
  // Skin / clothing
  skin?: string;
  shirt?: string;
  pants?: string;
  hairColor?: string;
  // Pose: arm angles in degrees (0 = down, negative = up/forward)
  leftArmAngle?: number;
  rightArmAngle?: number;
  leftForearmAngle?: number;
  rightForearmAngle?: number;
  // Leg angles
  leftLegAngle?: number;
  rightLegAngle?: number;
  // Body lean (degrees)
  bodyLean?: number;
  // Tool in right hand
  tool?: React.ReactNode;
  // Flip horizontally (face left)
  flip?: boolean;
  scale?: number;
};

export const Person: React.FC<PersonProps> = ({
  skin = "#F4A261",
  shirt = "#3B82F6",
  pants = "#1E293B",
  hairColor = "#3D2B1F",
  leftArmAngle = 20,
  rightArmAngle = -20,
  leftForearmAngle = 30,
  rightForearmAngle = 30,
  leftLegAngle = 5,
  rightLegAngle = -5,
  bodyLean = 0,
  tool,
  flip = false,
  scale = 1,
}) => {
  const W = 160;
  const H = 380;

  // Key body measurements
  const headR = 34;
  const headCY = 40;
  const neckH = 16;
  const torsoTop = headCY + headR + neckH;
  const torsoH = 100;
  const torsoW = 70;
  const torsoMidX = W / 2;

  const hipY = torsoTop + torsoH;
  const upperArmL = 60;
  const forearmL = 52;
  const upperLegL = 80;
  const lowerLegL = 74;

  function armPath(
    startX: number,
    startY: number,
    upperAngle: number,
    foreAngle: number
  ) {
    const ua = (upperAngle * Math.PI) / 180;
    const elbowX = startX + upperArmL * Math.sin(ua);
    const elbowY = startY + upperArmL * Math.cos(ua);
    const fa = ((upperAngle + foreAngle) * Math.PI) / 180;
    const handX = elbowX + forearmL * Math.sin(fa);
    const handY = elbowY + forearmL * Math.cos(fa);
    return { elbowX, elbowY, handX, handY };
  }

  function legPath(startX: number, startY: number, angle: number) {
    const ua = (angle * Math.PI) / 180;
    const kneeX = startX + upperLegL * Math.sin(ua);
    const kneeY = startY + upperLegL * Math.cos(ua);
    const fa = (angle * Math.PI) / 180;
    const footX = kneeX + lowerLegL * Math.sin(fa);
    const footY = kneeY + lowerLegL * Math.cos(fa);
    return { kneeX, kneeY, footX, footY };
  }

  const shoulderY = torsoTop + 14;
  const lArm = armPath(torsoMidX - torsoW / 2, shoulderY, -leftArmAngle, leftForearmAngle);
  const rArm = armPath(torsoMidX + torsoW / 2, shoulderY, rightArmAngle, rightForearmAngle);
  const lLeg = legPath(torsoMidX - 16, hipY, -leftLegAngle);
  const rLeg = legPath(torsoMidX + 16, hipY, rightLegAngle);

  const strokeW = 8;

  return (
    <div style={{
      scale: String(scale),
      transform: flip ? "scaleX(-1)" : undefined,
      transformOrigin: "center bottom",
      display: "inline-block",
    }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} overflow="visible">
        <g transform={`rotate(${bodyLean}, ${torsoMidX}, ${hipY})`}>
          {/* Legs */}
          <line x1={lLeg.kneeX} y1={lLeg.kneeY} x2={torsoMidX - 16} y2={hipY}
            stroke={pants} strokeWidth={strokeW + 2} strokeLinecap="round" />
          <line x1={lLeg.kneeX} y1={lLeg.kneeY} x2={lLeg.footX} y2={lLeg.footY}
            stroke={pants} strokeWidth={strokeW} strokeLinecap="round" />
          <line x1={rLeg.kneeX} y1={rLeg.kneeY} x2={torsoMidX + 16} y2={hipY}
            stroke={pants} strokeWidth={strokeW + 2} strokeLinecap="round" />
          <line x1={rLeg.kneeX} y1={rLeg.kneeY} x2={rLeg.footX} y2={rLeg.footY}
            stroke={pants} strokeWidth={strokeW} strokeLinecap="round" />
          {/* Shoes */}
          <ellipse cx={lLeg.footX} cy={lLeg.footY + 4} rx={12} ry={7} fill="#222" />
          <ellipse cx={rLeg.footX} cy={rLeg.footY + 4} rx={12} ry={7} fill="#222" />

          {/* Torso */}
          <rect x={torsoMidX - torsoW / 2} y={torsoTop} width={torsoW} height={torsoH}
            rx={12} fill={shirt} />
          {/* Shirt pocket */}
          <rect x={torsoMidX + 6} y={torsoTop + 18} width={16} height={14}
            rx={3} fill="rgba(255,255,255,0.18)" />

          {/* Left arm */}
          <line x1={torsoMidX - torsoW / 2} y1={shoulderY} x2={lArm.elbowX} y2={lArm.elbowY}
            stroke={shirt} strokeWidth={strokeW + 2} strokeLinecap="round" />
          <line x1={lArm.elbowX} y1={lArm.elbowY} x2={lArm.handX} y2={lArm.handY}
            stroke={skin} strokeWidth={strokeW} strokeLinecap="round" />
          {/* Left hand */}
          <circle cx={lArm.handX} cy={lArm.handY} r={7} fill={skin} />

          {/* Right arm */}
          <line x1={torsoMidX + torsoW / 2} y1={shoulderY} x2={rArm.elbowX} y2={rArm.elbowY}
            stroke={shirt} strokeWidth={strokeW + 2} strokeLinecap="round" />
          <line x1={rArm.elbowX} y1={rArm.elbowY} x2={rArm.handX} y2={rArm.handY}
            stroke={skin} strokeWidth={strokeW} strokeLinecap="round" />
          {/* Right hand */}
          <circle cx={rArm.handX} cy={rArm.handY} r={7} fill={skin} />

          {/* Head */}
          <circle cx={torsoMidX} cy={headCY} r={headR} fill={skin} />
          {/* Hair */}
          <ellipse cx={torsoMidX} cy={headCY - 18} rx={headR} ry={20} fill={hairColor} />
          <rect x={torsoMidX - headR} y={headCY - 34} width={headR * 2} height={20} fill={hairColor} />
          {/* Eyes */}
          <circle cx={torsoMidX - 11} cy={headCY - 4} r={4} fill="#fff" />
          <circle cx={torsoMidX + 11} cy={headCY - 4} r={4} fill="#fff" />
          <circle cx={torsoMidX - 11} cy={headCY - 4} r={2.5} fill="#333" />
          <circle cx={torsoMidX + 11} cy={headCY - 4} r={2.5} fill="#333" />
          {/* Smile */}
          <path d={`M ${torsoMidX - 10} ${headCY + 10} Q ${torsoMidX} ${headCY + 18} ${torsoMidX + 10} ${headCY + 10}`}
            stroke="#c0724a" strokeWidth={2.5} fill="none" strokeLinecap="round" />

          {/* Neck */}
          <rect x={torsoMidX - 10} y={headCY + headR - 4} width={20} height={neckH + 8}
            rx={6} fill={skin} />
        </g>
      </svg>
    </div>
  );
};
