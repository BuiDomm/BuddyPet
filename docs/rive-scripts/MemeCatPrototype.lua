-- BuddyPet / Meme Cat procedural prototype
-- Rive script type: Node Script (typed Luau)
-- Recommended artboard: MemeCat, 300 x 275
-- Place this scripted node at X = 150, Y = 140.
--
-- action input:
--   0 = automatic demo
--   1 = idle / breathe
--   2 = prowl / walk
--   3 = groom / paw lick
--   4 = fake UI card slap
--   5 = startled click reaction
--   6 = zoomies / victory

type Pose = {
  x: number,
  y: number,
  rotation: number,
  scaleX: number,
  scaleY: number,
}

type MemeCatPrototype = {
  -- Inputs shown in Rive's Inspector.
  action: Input<number>,
  speed: Input<number>,
  accent: Input<Color>,
  reduceMotion: Input<boolean>,
  showProp: Input<boolean>,

  time: number,
  overrideAction: number,
  overrideTime: number,
  reactionAge: number,
  pointerId: number?,
  pointerStartX: number,
  pointerStartY: number,
  dragOriginX: number,
  dragOriginY: number,
  dragX: number,
  dragY: number,
  dragging: boolean,

  paths: { Path },
  fillColors: { Color },
  strokeColors: { Color },
  strokeWidths: { number },
  layerCount: number,
  fillPaint: Paint,
  strokePaint: Paint,
}

-- Color.hex is intentionally avoided for compatibility with Rive Beta builds.
local OUTLINE = Color.rgb(62, 52, 70)
local OUTLINE_SOFT = Color.rgb(82, 69, 91)
local FUR = Color.rgb(171, 164, 184)
local FUR_LIGHT = Color.rgb(202, 196, 211)
local FUR_SHADE = Color.rgb(139, 131, 153)
local STRIPE = Color.rgb(112, 102, 126)
local CREAM = Color.rgb(246, 239, 237)
local CREAM_SHADE = Color.rgb(225, 215, 220)
local PINK = Color.rgb(234, 164, 184)
local PINK_LIGHT = Color.rgb(249, 202, 214)
local TONGUE = Color.rgb(231, 118, 148)
local WHITE = Color.rgb(255, 255, 255)
local EYE = Color.rgb(244, 189, 84)
local EYE_DEEP = Color.rgb(153, 92, 48)
local PUPIL = Color.rgb(42, 34, 47)
local CARD = Color.rgb(252, 250, 253)
local CARD_SOFT = Color.rgb(235, 230, 241)
local SHADOW = Color.rgba(42, 34, 47, 52)
local BLUSH = Color.rgba(239, 135, 162, 48)
local TRANSPARENT = Color.rgba(0, 0, 0, 0)
local KAPPA = 0.5522847498
local PI = 3.1415926536

function clamp(value: number, minimum: number, maximum: number): number
  if value < minimum then return minimum end
  if value > maximum then return maximum end
  return value
end

function lerp(startValue: number, endValue: number, amount: number): number
  return startValue + (endValue - startValue) * amount
end

function smoothstep(startValue: number, endValue: number, value: number): number
  local amount = clamp((value - startValue) / (endValue - startValue), 0, 1)
  return amount * amount * (3 - 2 * amount)
end

function pose(x: number, y: number, rotation: number, scaleX: number, scaleY: number): Pose
  return {
    x = x,
    y = y,
    rotation = rotation,
    scaleX = scaleX,
    scaleY = scaleY,
  }
end

function childPose(parent: Pose, x: number, y: number, rotation: number, scaleX: number, scaleY: number): Pose
  local px = x * parent.scaleX
  local py = y * parent.scaleY
  local cosine = math.cos(parent.rotation)
  local sine = math.sin(parent.rotation)
  return {
    x = parent.x + px * cosine - py * sine,
    y = parent.y + px * sine + py * cosine,
    rotation = parent.rotation + rotation,
    scaleX = parent.scaleX * scaleX,
    scaleY = parent.scaleY * scaleY,
  }
end

function point(transform: Pose, x: number, y: number): Vector
  local px = x * transform.scaleX
  local py = y * transform.scaleY
  local cosine = math.cos(transform.rotation)
  local sine = math.sin(transform.rotation)
  return Vector.xy(
    transform.x + px * cosine - py * sine,
    transform.y + px * sine + py * cosine
  )
end

function nextPath(self: MemeCatPrototype, fill: Color, strokeWidth: number, strokeColor: Color?): Path
  self.layerCount += 1
  local path = self.paths[self.layerCount]
  path:reset()
  self.fillColors[self.layerCount] = fill
  self.strokeWidths[self.layerCount] = strokeWidth
  self.strokeColors[self.layerCount] = strokeColor or OUTLINE
  return path
end

function strokeOnly(self: MemeCatPrototype, strokeWidth: number, strokeColor: Color): Path
  return nextPath(self, TRANSPARENT, strokeWidth, strokeColor)
end

function addOval(self: MemeCatPrototype, transform: Pose, radiusX: number, radiusY: number, fill: Color, strokeWidth: number, strokeColor: Color?)
  local path = nextPath(self, fill, strokeWidth, strokeColor)
  path:moveTo(point(transform, radiusX, 0))
  path:cubicTo(point(transform, radiusX, KAPPA * radiusY), point(transform, KAPPA * radiusX, radiusY), point(transform, 0, radiusY))
  path:cubicTo(point(transform, -KAPPA * radiusX, radiusY), point(transform, -radiusX, KAPPA * radiusY), point(transform, -radiusX, 0))
  path:cubicTo(point(transform, -radiusX, -KAPPA * radiusY), point(transform, -KAPPA * radiusX, -radiusY), point(transform, 0, -radiusY))
  path:cubicTo(point(transform, KAPPA * radiusX, -radiusY), point(transform, radiusX, -KAPPA * radiusY), point(transform, radiusX, 0))
  path:close()
end

function addRoundedRect(self: MemeCatPrototype, transform: Pose, width: number, height: number, radius: number, fill: Color, strokeWidth: number, strokeColor: Color?)
  local path = nextPath(self, fill, strokeWidth, strokeColor)
  local halfWidth = width * 0.5
  local halfHeight = height * 0.5
  local corner = clamp(radius, 0, math.min(halfWidth, halfHeight))
  local handle = corner * KAPPA

  path:moveTo(point(transform, -halfWidth + corner, -halfHeight))
  path:lineTo(point(transform, halfWidth - corner, -halfHeight))
  path:cubicTo(point(transform, halfWidth - corner + handle, -halfHeight), point(transform, halfWidth, -halfHeight + corner - handle), point(transform, halfWidth, -halfHeight + corner))
  path:lineTo(point(transform, halfWidth, halfHeight - corner))
  path:cubicTo(point(transform, halfWidth, halfHeight - corner + handle), point(transform, halfWidth - corner + handle, halfHeight), point(transform, halfWidth - corner, halfHeight))
  path:lineTo(point(transform, -halfWidth + corner, halfHeight))
  path:cubicTo(point(transform, -halfWidth + corner - handle, halfHeight), point(transform, -halfWidth, halfHeight - corner + handle), point(transform, -halfWidth, halfHeight - corner))
  path:lineTo(point(transform, -halfWidth, -halfHeight + corner))
  path:cubicTo(point(transform, -halfWidth, -halfHeight + corner - handle), point(transform, -halfWidth + corner - handle, -halfHeight), point(transform, -halfWidth + corner, -halfHeight))
  path:close()
end

function addSparkle(self: MemeCatPrototype, transform: Pose, size: number, fill: Color)
  local path = nextPath(self, fill, 1.8, OUTLINE)
  path:moveTo(point(transform, 0, -size))
  path:lineTo(point(transform, size * 0.24, -size * 0.25))
  path:lineTo(point(transform, size, 0))
  path:lineTo(point(transform, size * 0.24, size * 0.25))
  path:lineTo(point(transform, 0, size))
  path:lineTo(point(transform, -size * 0.24, size * 0.25))
  path:lineTo(point(transform, -size, 0))
  path:lineTo(point(transform, -size * 0.24, -size * 0.25))
  path:close()
end

function addSpeedLine(self: MemeCatPrototype, transform: Pose, width: number)
  local path = strokeOnly(self, width, FUR_SHADE)
  path:moveTo(point(transform, -18, 0))
  path:cubicTo(point(transform, -8, -1), point(transform, 9, 1), point(transform, 18, 0))
end

function addCatTail(self: MemeCatPrototype, transform: Pose, puff: number, phase: number)
  local width = 1 + puff * 0.38
  local path = nextPath(self, FUR, 3)
  path:moveTo(point(transform, -7 * width, 22))
  path:cubicTo(point(transform, -13 * width, 8), point(transform, -12 * width, -9), point(transform, -1 * width, -21))
  path:cubicTo(point(transform, 10 * width, -33), point(transform, 8 * width, -48), point(transform, 19 * width, -51))
  path:cubicTo(point(transform, 34 * width, -55), point(transform, 39 * width, -34), point(transform, 29 * width, -26))
  path:cubicTo(point(transform, 19 * width, -17), point(transform, 17 * width, 4), point(transform, 10 * width, 23))
  path:close()

  -- Three short bands make the tail read as tabby even in motion.
  for index = 1, 3 do
    local y = -9 - index * 9
    local band = strokeOnly(self, 4.2 + puff * 1.2, STRIPE)
    band:moveTo(point(transform, 7 * width, y + math.sin(phase + index) * 0.7))
    band:cubicTo(point(transform, 12 * width, y - 2), point(transform, 18 * width, y - 2), point(transform, 22 * width, y + 1))
  end

  local tip = strokeOnly(self, 5.2 + puff * 1.5, STRIPE)
  tip:moveTo(point(transform, 18 * width, -48))
  tip:cubicTo(point(transform, 26 * width, -50), point(transform, 32 * width, -43), point(transform, 31 * width, -35))
end

function addCatLeg(self: MemeCatPrototype, transform: Pose, lift: number)
  addRoundedRect(self, childPose(transform, 0, 5 - lift, 0, 1, 1), 19, 25, 8, FUR_SHADE, 2.8)
  addOval(self, childPose(transform, 0, 17 - lift, 0, 1, 1), 12.5, 7.2, FUR, 2.8)

  local toeA = strokeOnly(self, 1.5, OUTLINE_SOFT)
  toeA:moveTo(point(childPose(transform, -3.5, 16 - lift, 0, 1, 1), 0, -1.5))
  toeA:lineTo(point(childPose(transform, -3.5, 16 - lift, 0, 1, 1), 0, 2.3))
  local toeB = strokeOnly(self, 1.5, OUTLINE_SOFT)
  toeB:moveTo(point(childPose(transform, 3.5, 16 - lift, 0, 1, 1), 0, -1.5))
  toeB:lineTo(point(childPose(transform, 3.5, 16 - lift, 0, 1, 1), 0, 2.3))
end

function addCatBody(self: MemeCatPrototype, transform: Pose, accent: Color)
  local body = nextPath(self, FUR, 3.2)
  body:moveTo(point(transform, -34, -37))
  body:cubicTo(point(transform, -48, -21), point(transform, -50, 17), point(transform, -39, 38))
  body:cubicTo(point(transform, -25, 58), point(transform, 27, 58), point(transform, 41, 37))
  body:cubicTo(point(transform, 52, 17), point(transform, 47, -22), point(transform, 34, -37))
  body:cubicTo(point(transform, 18, -48), point(transform, -20, -48), point(transform, -34, -37))
  body:close()

  local belly = nextPath(self, CREAM, 0)
  belly:moveTo(point(transform, -27, 6))
  belly:cubicTo(point(transform, -19, -7), point(transform, 18, -7), point(transform, 28, 7))
  belly:cubicTo(point(transform, 31, 28), point(transform, 19, 47), point(transform, 0, 48))
  belly:cubicTo(point(transform, -20, 47), point(transform, -31, 29), point(transform, -27, 6))
  belly:close()

  -- Soft chest tuft breaks the circular belly silhouette.
  local chest = nextPath(self, CREAM, 2.2)
  chest:moveTo(point(transform, -20, -29))
  chest:cubicTo(point(transform, -9, -22), point(transform, 9, -22), point(transform, 20, -29))
  chest:lineTo(point(transform, 14, -14))
  chest:lineTo(point(transform, 6, -18))
  chest:lineTo(point(transform, 0, -9))
  chest:lineTo(point(transform, -7, -18))
  chest:lineTo(point(transform, -15, -14))
  chest:close()

  -- Collar and tiny bell provide a controlled accent colour.
  local collar = strokeOnly(self, 5.2, accent)
  collar:moveTo(point(transform, -25, -31))
  collar:cubicTo(point(transform, -10, -24), point(transform, 10, -24), point(transform, 25, -31))
  addOval(self, childPose(transform, 0, -22, 0, 1, 1), 5.4, 5.8, accent, 2, OUTLINE)
  addOval(self, childPose(transform, -1.5, -23.5, 0, 1, 1), 1.5, 1.3, WHITE, 0)

  -- Two restrained flank stripes keep the body from reading as a plain blob.
  local leftStripe = strokeOnly(self, 4.2, STRIPE)
  leftStripe:moveTo(point(transform, -39, 3))
  leftStripe:cubicTo(point(transform, -33, 5), point(transform, -29, 9), point(transform, -26, 14))
  local rightStripe = strokeOnly(self, 4.2, STRIPE)
  rightStripe:moveTo(point(transform, 39, 3))
  rightStripe:cubicTo(point(transform, 33, 5), point(transform, 29, 9), point(transform, 26, 14))
end

function armEnd(shoulder: Pose, bend: number, upperLength: number, lowerLength: number): Pose
  local elbow = childPose(shoulder, 0, upperLength, bend, 1, 1)
  return childPose(elbow, 0, lowerLength, 0, 1, 1)
end

function addCatPaw(self: MemeCatPrototype, transform: Pose, spread: number)
  addOval(self, transform, 9 + spread * 1.5, 8 - spread * 0.5, FUR_LIGHT, 2.5)
  for index = -1, 1 do
    local toe = strokeOnly(self, 1.4, OUTLINE_SOFT)
    local x = index * 3.2
    toe:moveTo(point(transform, x, 2.2))
    toe:cubicTo(point(transform, x - 0.5, 4), point(transform, x - 0.4, 5.2), point(transform, x, 6))
  end
end

function addCatArm(self: MemeCatPrototype, shoulder: Pose, bend: number, upperLength: number, lowerLength: number, drawPaw: boolean, pawSpread: number): Pose
  addRoundedRect(self, childPose(shoulder, 0, upperLength * 0.5, 0, 1, 1), 13.5, upperLength + 7, 6.4, FUR, 2.7)
  local elbow = childPose(shoulder, 0, upperLength, bend, 1, 1)
  addRoundedRect(self, childPose(elbow, 0, lowerLength * 0.5, 0, 1, 1), 12.5, lowerLength + 6, 6, FUR_LIGHT, 2.7)
  local paw = childPose(elbow, 0, lowerLength, 0, 1, 1)
  if drawPaw then addCatPaw(self, paw, pawSpread) end
  return paw
end

function addCatHeadBase(self: MemeCatPrototype, transform: Pose, earLeft: number, earRight: number)
  -- Ears are curved quadrilaterals rather than hard triangles, giving the
  -- mascot a soft silhouette while retaining the meme-cat alertness.
  local leftEarPose = childPose(transform, -30, -35, earLeft, 1, 1)
  local leftEar = nextPath(self, FUR, 3)
  leftEar:moveTo(point(leftEarPose, -16, 15))
  leftEar:lineTo(point(leftEarPose, -12, -32))
  leftEar:cubicTo(point(leftEarPose, -2, -25), point(leftEarPose, 10, -12), point(leftEarPose, 17, 10))
  leftEar:close()

  local rightEarPose = childPose(transform, 30, -35, earRight, 1, 1)
  local rightEar = nextPath(self, FUR, 3)
  rightEar:moveTo(point(rightEarPose, -17, 10))
  rightEar:cubicTo(point(rightEarPose, -10, -12), point(rightEarPose, 2, -25), point(rightEarPose, 12, -32))
  rightEar:lineTo(point(rightEarPose, 16, 15))
  rightEar:close()

  local leftInner = nextPath(self, PINK, 0)
  leftInner:moveTo(point(leftEarPose, -10, 8))
  leftInner:lineTo(point(leftEarPose, -8, -22))
  leftInner:cubicTo(point(leftEarPose, -1, -15), point(leftEarPose, 7, -6), point(leftEarPose, 11, 8))
  leftInner:close()

  local rightInner = nextPath(self, PINK, 0)
  rightInner:moveTo(point(rightEarPose, -11, 8))
  rightInner:cubicTo(point(rightEarPose, -7, -6), point(rightEarPose, 1, -15), point(rightEarPose, 8, -22))
  rightInner:lineTo(point(rightEarPose, 10, 8))
  rightInner:close()

  local head = nextPath(self, FUR, 3.2)
  head:moveTo(point(transform, -42, -31))
  head:cubicTo(point(transform, -54, -18), point(transform, -55, 14), point(transform, -39, 32))
  head:cubicTo(point(transform, -20, 50), point(transform, 20, 50), point(transform, 39, 32))
  head:cubicTo(point(transform, 55, 14), point(transform, 54, -18), point(transform, 42, -31))
  head:cubicTo(point(transform, 24, -45), point(transform, -24, -45), point(transform, -42, -31))
  head:close()

  -- Side cheek fluff adds an appealing non-geometric contour.
  local leftFluff = nextPath(self, FUR_LIGHT, 0)
  leftFluff:moveTo(point(transform, -45, 12))
  leftFluff:lineTo(point(transform, -53, 21))
  leftFluff:lineTo(point(transform, -43, 24))
  leftFluff:lineTo(point(transform, -47, 33))
  leftFluff:lineTo(point(transform, -34, 30))
  leftFluff:close()
  local rightFluff = nextPath(self, FUR_LIGHT, 0)
  rightFluff:moveTo(point(transform, 45, 12))
  rightFluff:lineTo(point(transform, 53, 21))
  rightFluff:lineTo(point(transform, 43, 24))
  rightFluff:lineTo(point(transform, 47, 33))
  rightFluff:lineTo(point(transform, 34, 30))
  rightFluff:close()

  -- Forehead tabby mark: one central taper plus two curved side marks.
  local centerStripe = nextPath(self, STRIPE, 0)
  centerStripe:moveTo(point(transform, -5, -41))
  centerStripe:lineTo(point(transform, 0, -24))
  centerStripe:lineTo(point(transform, 5, -41))
  centerStripe:close()
  local leftStripe = strokeOnly(self, 4, STRIPE)
  leftStripe:moveTo(point(transform, -22, -37))
  leftStripe:cubicTo(point(transform, -18, -32), point(transform, -15, -28), point(transform, -14, -23))
  local rightStripe = strokeOnly(self, 4, STRIPE)
  rightStripe:moveTo(point(transform, 22, -37))
  rightStripe:cubicTo(point(transform, 18, -32), point(transform, 15, -28), point(transform, 14, -23))
end

function addCatFace(self: MemeCatPrototype, transform: Pose, phase: number, expression: number)
  local blink = ((phase * 0.47) % 4.7) > 4.48 and 0.14 or 1
  local eyeScale = blink
  local pupilScale = 1
  local gazeX = math.sin(phase * 0.62) * 1.8
  local browTilt = 0

  if expression == 3 then
    eyeScale *= 0.72
    gazeX = -1.8
  elseif expression == 4 then
    eyeScale *= 0.58
    gazeX = 3.2
    browTilt = 0.16
  elseif expression == 5 then
    eyeScale = 1.28
    pupilScale = 1.35
    gazeX = 0
    browTilt = -0.17
  elseif expression == 6 then
    eyeScale *= 0.5
    pupilScale = 0.85
    gazeX = 2.4
  elseif expression == 7 then
    eyeScale = 1.15
    pupilScale = 1.18
    gazeX = math.sin(phase * 8) * 2.4
  end

  -- Two overlapping cream lobes form a plush muzzle without a hard rectangle.
  addOval(self, childPose(transform, -12, 14, -0.06, 1, 1), 20, 17, CREAM, 0)
  addOval(self, childPose(transform, 12, 14, 0.06, 1, 1), 20, 17, CREAM, 0)
  addOval(self, childPose(transform, -34, 13, 0, 1, 1), 9, 5, BLUSH, 0)
  addOval(self, childPose(transform, 34, 13, 0, 1, 1), 9, 5, BLUSH, 0)

  local leftEye = childPose(transform, -20 + gazeX * 0.22, -6, -0.03, 1, eyeScale)
  local rightEye = childPose(transform, 20 + gazeX * 0.22, -6, 0.03, 1, eyeScale)
  addOval(self, leftEye, 11, 13.5, WHITE, 2.3)
  addOval(self, rightEye, 11, 13.5, WHITE, 2.3)
  addOval(self, childPose(leftEye, gazeX, 1.5, 0, pupilScale, pupilScale), 5.7, 7.5, EYE, 1.5, EYE_DEEP)
  addOval(self, childPose(rightEye, gazeX, 1.5, 0, pupilScale, pupilScale), 5.7, 7.5, EYE, 1.5, EYE_DEEP)
  addOval(self, childPose(leftEye, gazeX * 1.15, 2, 0, pupilScale, pupilScale), 2.8, 4.6, PUPIL, 0)
  addOval(self, childPose(rightEye, gazeX * 1.15, 2, 0, pupilScale, pupilScale), 2.8, 4.6, PUPIL, 0)
  addOval(self, childPose(leftEye, gazeX - 2.2, -3.1, 0, 1, 1), 2.1, 2.5, WHITE, 0)
  addOval(self, childPose(rightEye, gazeX - 2.2, -3.1, 0, 1, 1), 2.1, 2.5, WHITE, 0)

  local leftBrow = strokeOnly(self, 3.4, OUTLINE_SOFT)
  leftBrow:moveTo(point(transform, -31, -23 - browTilt * 12))
  leftBrow:cubicTo(point(transform, -25, -28), point(transform, -17, -28 + browTilt * 10), point(transform, -11, -24 + browTilt * 14))
  local rightBrow = strokeOnly(self, 3.4, OUTLINE_SOFT)
  rightBrow:moveTo(point(transform, 11, -24 + browTilt * 14))
  rightBrow:cubicTo(point(transform, 17, -28 + browTilt * 10), point(transform, 25, -28), point(transform, 31, -23 - browTilt * 12))

  local nose = nextPath(self, PINK, 1.8, OUTLINE)
  nose:moveTo(point(transform, -6, 10))
  nose:cubicTo(point(transform, -3, 7), point(transform, 3, 7), point(transform, 6, 10))
  nose:cubicTo(point(transform, 4, 15), point(transform, -4, 15), point(transform, -6, 10))
  nose:close()

  if expression == 5 then
    addOval(self, childPose(transform, 0, 25, 0, 1, 1), 7.2, 8.4, PUPIL, 0)
    addOval(self, childPose(transform, 0, 28.5, 0, 1, 1), 4.5, 2.7, TONGUE, 0)
  elseif expression == 6 then
    local grin = strokeOnly(self, 3, OUTLINE)
    grin:moveTo(point(transform, -13, 20))
    grin:cubicTo(point(transform, -5, 30), point(transform, 6, 30), point(transform, 14, 18))
    addOval(self, childPose(transform, 4, 27, 0.08, 1, 1), 5, 4.5, TONGUE, 1.5, OUTLINE)
  elseif expression == 4 then
    local smirk = strokeOnly(self, 2.8, OUTLINE)
    smirk:moveTo(point(transform, -4, 21))
    smirk:cubicTo(point(transform, 4, 24), point(transform, 10, 22), point(transform, 14, 18))
  else
    local mouthLeft = strokeOnly(self, 2.6, OUTLINE)
    mouthLeft:moveTo(point(transform, 0, 15))
    mouthLeft:cubicTo(point(transform, -1, 23), point(transform, -9, 24), point(transform, -13, 19))
    local mouthRight = strokeOnly(self, 2.6, OUTLINE)
    mouthRight:moveTo(point(transform, 0, 15))
    mouthRight:cubicTo(point(transform, 1, 23), point(transform, 9, 24), point(transform, 13, 19))
  end

  -- Whiskers are short and swept, avoiding the rigid wire look of the SVG.
  for index = -1, 1 do
    local offset = index * 8
    local leftWhisker = strokeOnly(self, 1.8, OUTLINE_SOFT)
    leftWhisker:moveTo(point(transform, -27, 15 + offset * 0.38))
    leftWhisker:cubicTo(point(transform, -39, 12 + offset), point(transform, -48, 12 + offset), point(transform, -57, 9 + offset))
    local rightWhisker = strokeOnly(self, 1.8, OUTLINE_SOFT)
    rightWhisker:moveTo(point(transform, 27, 15 + offset * 0.38))
    rightWhisker:cubicTo(point(transform, 39, 12 + offset), point(transform, 48, 12 + offset), point(transform, 57, 9 + offset))
  end
end

function addFakeCard(self: MemeCatPrototype, transform: Pose, accent: Color, damage: number)
  addRoundedRect(self, transform, 62, 54, 9, CARD, 2.8, OUTLINE)
  addRoundedRect(self, childPose(transform, 0, -19, 0, 1, 1), 62, 16, 8, accent, 0)
  addOval(self, childPose(transform, -21, -19, 0, 1, 1), 3, 3, PINK_LIGHT, 0)
  addOval(self, childPose(transform, -12, -19, 0, 1, 1), 3, 3, WHITE, 0)
  addRoundedRect(self, childPose(transform, -8, 2, 0, 1, 1), 36, 5, 2.5, CARD_SOFT, 0)
  addRoundedRect(self, childPose(transform, -14, 13, 0, 1, 1), 24, 5, 2.5, CARD_SOFT, 0)
  addOval(self, childPose(transform, 20, 9, 0, 1, 1), 7, 7, accent, 0)

  if damage > 0.45 then
    local crackA = strokeOnly(self, 2.2, OUTLINE)
    crackA:moveTo(point(transform, -3, -2))
    crackA:lineTo(point(transform, 3, 4))
    crackA:lineTo(point(transform, -1, 9))
    crackA:lineTo(point(transform, 5, 15))
    local crackB = strokeOnly(self, 2.2, OUTLINE)
    crackB:moveTo(point(transform, 3, 4))
    crackB:lineTo(point(transform, 11, 1))
  end
end

function selectedAction(self: MemeCatPrototype): number
  if self.dragging then return 7 end
  if self.overrideTime > 0 then return self.overrideAction end

  local requested = math.floor(self.action + 0.5)
  if requested > 0 then return clamp(requested, 1, 6) end

  local cycle = (self.time * 0.68) % 19
  if cycle < 4.2 then return 1 end
  if cycle < 8.2 then return 2 end
  if cycle < 12.2 then return 3 end
  if cycle < 15.6 then return 4 end
  return 6
end

function init(self: MemeCatPrototype, _context: Context): boolean
  self.fillPaint = Paint.with({
    style = 'fill',
    color = WHITE,
  })
  self.strokePaint = Paint.with({
    style = 'stroke',
    color = OUTLINE,
    thickness = 3,
    join = 'round',
    cap = 'round',
  })

  for index = 1, 128 do
    self.paths[index] = Path.new()
    self.fillColors[index] = TRANSPARENT
    self.strokeColors[index] = OUTLINE
    self.strokeWidths[index] = 0
  end
  return true
end

function advance(self: MemeCatPrototype, seconds: number): boolean
  local playbackSpeed = clamp(self.speed, 0.25, 2.5)
  self.time += seconds * playbackSpeed

  if self.overrideTime > 0 then
    self.overrideTime = math.max(0, self.overrideTime - seconds)
    self.reactionAge += seconds
  end

  if not self.dragging then
    local spring = clamp(seconds * 8, 0, 1)
    self.dragX += (0 - self.dragX) * spring
    self.dragY += (0 - self.dragY) * spring
  end
  return true
end

function update(_self: MemeCatPrototype)
  -- Inputs are sampled directly by draw; update keeps Inspector changes live.
end

function draw(self: MemeCatPrototype, renderer: Renderer)
  self.layerCount = 0

  local action = selectedAction(self)
  local phase = self.time
  local motionScale = self.reduceMotion and 0.22 or 1
  local rootX = self.dragX
  local rootY = self.dragY + 1
  local rootRotation = math.sin(phase * 1.15) * 0.018
  local rootScaleX = 1
  local rootScaleY = 1
  local breathe = 1 + math.sin(phase * 1.9) * 0.018
  local headRotation = math.sin(phase * 0.9) * 0.035
  local leftLeg = 0
  local rightLeg = 0
  local leftLift = 0
  local rightLift = 0
  local tailRotation = -0.34 + math.sin(phase * 1.7) * 0.18
  local tailPuff = 0
  local earLeft = math.sin(phase * 1.1) * 0.025
  local earRight = -math.sin(phase * 1.1) * 0.025
  local leftSwing = -0.28 + math.sin(phase * 1.8) * 0.03
  local leftBend = -0.26
  local rightSwing = 0.28 - math.sin(phase * 1.8) * 0.03
  local rightBend = 0.26
  local foregroundLeft = false
  local foregroundRight = false
  local pawSpread = 0
  local cardRotation = 0.04
  local cardDamage = 0
  local impact = 0

  if action == 2 then
    local gait = phase * 5.8
    rootX += math.sin(phase * 0.82) * 31 * motionScale
    rootY -= math.abs(math.sin(gait)) * 3.5 * motionScale
    rootRotation = math.sin(gait) * 0.032 * motionScale
    headRotation = -rootRotation * 0.8 + math.sin(gait * 0.5) * 0.018
    leftLeg = math.sin(gait) * 0.38 * motionScale
    rightLeg = -leftLeg
    leftLift = math.max(0, math.sin(gait)) * 7 * motionScale
    rightLift = math.max(0, -math.sin(gait)) * 7 * motionScale
    leftSwing = -0.22 + math.sin(gait) * 0.34 * motionScale
    leftBend = -0.18
    rightSwing = 0.22 - math.sin(gait) * 0.34 * motionScale
    rightBend = 0.18
    tailRotation = -0.55 - math.sin(gait) * 0.13 * motionScale
  elseif action == 3 then
    local groomCycle = (phase * 0.72) % 1
    local reach = smoothstep(0.04, 0.24, groomCycle) * (1 - smoothstep(0.82, 0.98, groomCycle))
    local lick = math.sin(clamp((groomCycle - 0.24) / 0.55, 0, 1) * PI * 5)
    headRotation = lerp(0.01, -0.12 + lick * 0.018, reach)
    leftSwing = lerp(-0.28, -2.34, reach)
    leftBend = lerp(-0.26, -0.48, reach)
    foregroundLeft = reach > 0.18
    rightSwing = 0.42
    rightBend = 0.42
    rootRotation = -0.025 * reach
    tailRotation = -0.2 + math.sin(phase * 2.1) * 0.09
  elseif action == 4 then
    local slap = (phase * 0.62) % 1
    local windup = smoothstep(0.02, 0.32, slap)
    local strike = smoothstep(0.32, 0.47, slap)
    local recover = smoothstep(0.58, 0.98, slap)
    local reach = clamp(windup - strike + strike * 1.65 - recover * 0.65, 0, 1)
    rootRotation = lerp(-0.06, 0.1, strike) * motionScale
    headRotation = -0.08 + strike * 0.18
    rightSwing = lerp(0.28, -1.68, reach)
    rightBend = lerp(0.26, -0.16, reach)
    foregroundRight = true
    leftSwing = -0.48
    leftBend = -0.62
    cardRotation = 0.04 + strike * 0.24 * motionScale - recover * 0.16 * motionScale
    cardDamage = strike
    impact = smoothstep(0.40, 0.47, slap) * (1 - smoothstep(0.47, 0.58, slap))
    tailRotation = -0.62 + windup * 0.28
  elseif action == 5 then
    local startled = self.overrideTime > 0 and clamp(self.reactionAge / 1.24, 0, 1) or ((phase * 0.53) % 1)
    local crouch = smoothstep(0, 0.13, startled)
    local launch = smoothstep(0.13, 0.34, startled)
    local land = smoothstep(0.55, 0.94, startled)
    rootY += (crouch * 9 - launch * 46 + land * 37) * motionScale
    rootScaleX = 1 + (crouch * 0.12 - launch * 0.09 + land * -0.03) * motionScale
    rootScaleY = 1 + (crouch * -0.1 + launch * 0.16 - land * 0.06) * motionScale
    rootRotation = math.sin(startled * PI * 7) * (1 - startled) * 0.075 * motionScale
    headRotation = -rootRotation * 1.25
    leftSwing = 2.2
    leftBend = 0.18
    rightSwing = -2.2
    rightBend = -0.18
    foregroundLeft = true
    foregroundRight = true
    pawSpread = 1
    leftLeg = -0.26
    rightLeg = 0.26
    tailRotation = -0.92 + math.sin(startled * PI * 8) * 0.06
    tailPuff = 1
    earLeft = -0.2
    earRight = 0.2
  elseif action == 6 then
    local sprint = phase * 8.5
    local travel = math.sin(phase * 1.85)
    rootX += travel * 48 * motionScale
    rootY -= math.abs(math.sin(sprint)) * 6 * motionScale
    rootRotation = math.cos(phase * 1.85) * 0.18 * motionScale
    headRotation = -rootRotation * 0.55
    leftLeg = math.sin(sprint) * 0.72 * motionScale
    rightLeg = -leftLeg
    leftLift = math.max(0, math.sin(sprint)) * 10 * motionScale
    rightLift = math.max(0, -math.sin(sprint)) * 10 * motionScale
    leftSwing = 1.05 + math.sin(sprint) * 0.34 * motionScale
    leftBend = 0.58
    rightSwing = -1.05 - math.sin(sprint) * 0.34 * motionScale
    rightBend = -0.58
    tailRotation = -1.08 - math.cos(phase * 1.85) * 0.12
    earLeft = -0.11
    earRight = 0.11
  elseif action == 7 then
    rootRotation = math.sin(phase * 10) * 0.055
    leftSwing = 1.75 + math.sin(phase * 11) * 0.35
    leftBend = 0.2
    rightSwing = -1.75 - math.sin(phase * 11) * 0.35
    rightBend = -0.2
    foregroundLeft = true
    foregroundRight = true
    leftLeg = math.sin(phase * 12) * 0.2
    rightLeg = -leftLeg
    tailRotation = -0.7 + math.sin(phase * 8) * 0.18
    tailPuff = 0.45
  end

  local root = pose(rootX, rootY, rootRotation, rootScaleX, rootScaleY)

  -- Grounded contact shadow and props are built before the character.
  addOval(self, childPose(root, 0, 103, 0, 1 / rootScaleX, 1 / rootScaleY), 61, 8, SHADOW, 0)

  if action == 6 and not self.reduceMotion then
    local direction = math.cos(phase * 1.85)
    local lineX = direction > 0 and -72 or 72
    for index = 1, 3 do
      addSpeedLine(self, childPose(root, lineX, 6 + index * 17, 0, 1, 1), 4.2 - index * 0.7)
    end
  end

  if action == 4 and self.showProp then
    addFakeCard(self, childPose(root, 78, 15 + cardDamage * 3, cardRotation, 1, 1), self.accent, cardDamage)
  end

  addCatTail(self, childPose(root, 37, 54, tailRotation, 1, 1), tailPuff, phase)
  addCatLeg(self, childPose(root, -23, 84, leftLeg, 1, 1), leftLift)
  addCatLeg(self, childPose(root, 23, 84, rightLeg, 1, 1), rightLift)

  local body = childPose(root, 0, 42, 0, 1, breathe)
  addCatBody(self, body, self.accent)

  local leftShoulder = childPose(root, -37, 20, leftSwing, 1, 1)
  local rightShoulder = childPose(root, 37, 20, rightSwing, 1, 1)
  local leftPaw = addCatArm(self, leftShoulder, leftBend, 18, 21, not foregroundLeft, pawSpread)
  local rightPaw = addCatArm(self, rightShoulder, rightBend, 18, 21, not foregroundRight, pawSpread)

  local head = childPose(root, 0, -28, headRotation, 1, 1)
  addCatHeadBase(self, head, earLeft, earRight)
  addCatFace(self, head, phase, action)

  -- Foreground paws are submitted after the face only for gestures that
  -- genuinely cross the face/card plane. This prevents accidental layer
  -- collisions during idle and walking.
  if foregroundLeft then addCatPaw(self, leftPaw, pawSpread) end
  if foregroundRight then addCatPaw(self, rightPaw, pawSpread) end

  if action == 3 then
    local groomCycle = (phase * 0.72) % 1
    local visible = smoothstep(0.22, 0.3, groomCycle) * (1 - smoothstep(0.77, 0.86, groomCycle))
    if visible > 0.12 then
      addOval(self, childPose(head, -6, 23, -0.35, 1, visible), 4.2, 6.5, TONGUE, 1.5, OUTLINE)
      addSparkle(self, childPose(head, -34, 25, phase * 0.8, 1, 1), 4.3, PINK_LIGHT)
    end
  elseif action == 4 and impact > 0.08 then
    addSparkle(self, childPose(root, 57, 5, phase * 2.2, 1 + impact * 0.45, 1 + impact * 0.45), 10, self.accent)
    local impactLineA = strokeOnly(self, 3, self.accent)
    impactLineA:moveTo(point(root, 62, -9))
    impactLineA:lineTo(point(root, 72, -18))
    local impactLineB = strokeOnly(self, 3, self.accent)
    impactLineB:moveTo(point(root, 65, 18))
    impactLineB:lineTo(point(root, 77, 25))
  elseif action == 5 then
    addSparkle(self, childPose(root, -61, -66, -phase, 0.75, 0.75), 8, PINK_LIGHT)
    addSparkle(self, childPose(root, 60, -56, phase, 0.58, 0.58), 8, self.accent)
  elseif action == 6 then
    addSparkle(self, childPose(root, -62, -63, phase, 0.55, 0.55), 8, PINK_LIGHT)
    addSparkle(self, childPose(root, 62, -49, -phase, 0.48, 0.48), 8, self.accent)
  end

  -- Paths are never mutated after being submitted during the frame.
  for index = 1, self.layerCount do
    self.fillPaint.color = self.fillColors[index]
    renderer:drawPath(self.paths[index], self.fillPaint)
    local strokeWidth = self.strokeWidths[index]
    if strokeWidth > 0 then
      self.strokePaint.thickness = strokeWidth
      self.strokePaint.color = self.strokeColors[index]
      renderer:drawPath(self.paths[index], self.strokePaint)
    end
  end
end

function pointerDown(self: MemeCatPrototype, event: PointerEvent)
  local x = event.position.x - self.dragX
  local y = event.position.y - self.dragY
  if x < -76 or x > 80 or y < -111 or y > 112 then return end

  self.pointerId = event.id
  self.pointerStartX = event.position.x
  self.pointerStartY = event.position.y
  self.dragOriginX = self.dragX
  self.dragOriginY = self.dragY
  self.dragging = false
  event:hit()
end

function pointerMove(self: MemeCatPrototype, event: PointerEvent)
  if self.pointerId ~= event.id then return end
  local deltaX = event.position.x - self.pointerStartX
  local deltaY = event.position.y - self.pointerStartY
  if math.abs(deltaX) + math.abs(deltaY) > 5 then self.dragging = true end
  if self.dragging then
    self.dragX = clamp(self.dragOriginX + deltaX, -62, 62)
    self.dragY = clamp(self.dragOriginY + deltaY, -38, 30)
  end
  event:hit()
end

function pointerUp(self: MemeCatPrototype, event: PointerEvent)
  if self.pointerId ~= event.id then return end
  if self.dragging then
    self.overrideAction = 6
    self.overrideTime = 1.2
  else
    self.overrideAction = 5
    self.overrideTime = 1.35
  end
  self.reactionAge = 0
  self.dragging = false
  self.pointerId = nil
  event:hit()
end

function pointerExit(self: MemeCatPrototype, event: PointerEvent)
  if self.pointerId ~= event.id then return end
  self.dragging = false
  self.pointerId = nil
end

return function(): Node<MemeCatPrototype>
  return {
    init = init,
    advance = advance,
    update = update,
    draw = draw,
    pointerDown = pointerDown,
    pointerMove = pointerMove,
    pointerUp = pointerUp,
    pointerExit = pointerExit,

    action = 0,
    speed = 1,
    accent = Color.rgb(132, 104, 200),
    reduceMotion = false,
    showProp = true,

    time = 0,
    overrideAction = 0,
    overrideTime = 0,
    reactionAge = 0,
    pointerId = nil,
    pointerStartX = 0,
    pointerStartY = 0,
    dragOriginX = 0,
    dragOriginY = 0,
    dragX = 0,
    dragY = 0,
    dragging = false,

    paths = {},
    fillColors = {},
    strokeColors = {},
    strokeWidths = {},
    layerCount = 0,
    fillPaint = late(),
    strokePaint = late(),
  }
end
