# frozen_string_literal: true
# Run: ruby scripts/generate_icons.rb
# Generates 24x24 + 48x48 PNG icons for every ConstructFlow toolbar button.

require 'zlib'
require 'fileutils'

OUT = File.join(__dir__, '..', 'apps', 'sketchup-extension', 'constructflow', 'icons')
FileUtils.mkdir_p(OUT)

# ── PNG encoder ────────────────────────────────────────────────────────────────
def chunk(type, data)
  [data.bytesize].pack('N') + type + data + [Zlib.crc32(type + data)].pack('N')
end

def encode_png(pixels)
  h = pixels.size; w = pixels[0].size
  raw = pixels.flat_map { |row| [0] + row.flatten }.pack('C*')
  "\x89PNG\r\n\x1a\n".b +
    chunk('IHDR', [w, h, 8, 6, 0, 0, 0].pack('NNC5')) +
    chunk('IDAT', Zlib::Deflate.deflate(raw, 9)) +
    chunk('IEND', '')
end

def scale(pixels, f)
  pixels.flat_map { |row| Array.new(f) { row.flat_map { |px| Array.new(f) { px } } } }
end

# ── Canvas ─────────────────────────────────────────────────────────────────────
class Canvas
  S = 24; T = [0,0,0,0]
  def initialize; @p = Array.new(S){Array.new(S){T.dup}}; end
  def px; @p; end

  def rect(x,y,w,h,c)
    (y...[y+h,S].min).each{|py| next if py<0; (x...[x+w,S].min).each{|px| next if px<0; @p[py][px]=c}}; self
  end
  def circle(cx,cy,r,c)
    (0...S).each{|py|(0...S).each{|px| @p[py][px]=c if (px-cx)**2+(py-cy)**2<=r*r}}; self
  end
  def ring(cx,cy,ro,ri,c)
    (0...S).each{|py|(0...S).each{|px| d2=(px-cx)**2+(py-cy)**2; @p[py][px]=c if d2<=ro*ro&&d2>ri*ri}}; self
  end
  def triangle(pts,c)
    ys=pts.map{|_,y|y}
    (ys.min..ys.max).each do |py|
      xs=[]
      pts.each_with_index do|(ax,ay),i|
        bx,by=pts[(i+1)%pts.size]
        next if (ay<py&&by<py)||(ay>py&&by>py)
        ay==by ? xs+=[ax,bx] : xs<<(ax+(py-ay).to_f/(by-ay)*(bx-ax)).round
      end
      next if xs.size<2; xs.sort!
      (xs.first..xs.last).each{|px| @p[py][px]=c if px.between?(0,S-1)}
    end; self
  end
  def hline(y,x1,x2,c,t=2)
    (-(t/2)...(t-t/2)).each{|dy| py=y+dy; next unless py.between?(0,S-1); (x1..x2).each{|px| @p[py][px]=c if px.between?(0,S-1)}}; self
  end
  def vline(x,y1,y2,c,t=2)
    (-(t/2)...(t-t/2)).each{|dx| px=x+dx; next unless px.between?(0,S-1); (y1..y2).each{|py| @p[py][px]=c if py.between?(0,S-1)}}; self
  end
end

# ── Colours ────────────────────────────────────────────────────────────────────
CORE_B=[59,130,246,255]; CORE_D=[29,78,216,255]
ARCH_B=[107,114,128,255]; ARCH_D=[55,65,81,255]
OPE_B=[124,58,237,255]
STR_B=[55,65,81,255]; STR_D=[17,24,39,255]
ROOF_B=[245,158,11,255]; ROOF_D=[180,110,5,255]
SURF_B=[16,185,129,255]; SURF_D=[5,128,90,255]
DRN_B=[6,182,212,255]; DRN_D=[8,130,150,255]
ELEC_B=[239,68,68,255]; ELEC_D=[185,28,28,255]
INT_B=[236,72,153,255]; INT_D=[157,23,77,255]
LIB_B=[249,115,22,255]; LIB_D=[194,65,12,255]
CST_B=[20,184,166,255]; CST_D=[13,148,136,255]
W=[255,255,255,255]

# ── Icon definitions ───────────────────────────────────────────────────────────
ICONS = {
  'panel' => -> {
    c=Canvas.new
    c.rect(2,2,9,9,CORE_B).rect(13,2,9,9,CORE_D)
    c.rect(2,13,9,9,CORE_D).rect(13,13,9,9,CORE_B)
    c
  },
  'inspector' => -> {
    c=Canvas.new
    c.ring(12,12,11,8,CORE_B).rect(11,9,2,2,W).rect(11,12,2,6,W)
  },
  'level' => -> {
    c=Canvas.new
    c.rect(2,4,18,4,CORE_B).rect(2,10,18,4,CORE_D).rect(2,16,18,4,CORE_B)
    c.vline(20,3,21,CORE_D,2).triangle([[20,2],[24,12],[20,22]],CORE_D)
  },
  'phase' => -> {
    c=Canvas.new
    c.rect(3,5,18,16,CORE_B).rect(3,5,18,5,CORE_D)
    c.rect(7,3,2,5,W).rect(15,3,2,5,W)
    [[6,12],[11,12],[16,12],[6,16],[11,16],[16,16]].each{|x,y|c.rect(x,y,3,2,W)}
    c
  },
  'wall' => -> {
    c=Canvas.new
    c.rect(1,6,22,12,ARCH_B).rect(1,6,22,2,ARCH_D).rect(1,16,22,2,ARCH_D)
  },
  'opening' => -> {
    c=Canvas.new
    c.rect(1,6,7,12,ARCH_B).rect(16,6,7,12,ARCH_B)
    c.rect(1,6,7,2,ARCH_D).rect(1,16,7,2,ARCH_D)
    c.rect(16,6,7,2,ARCH_D).rect(16,16,7,2,ARCH_D)
    c.hline(19,8,16,OPE_B,2)
  },
  'door_window' => -> {
    c=Canvas.new
    c.rect(4,4,2,16,OPE_B).rect(4,4,14,2,OPE_B).rect(16,4,2,16,OPE_B).rect(4,18,14,2,OPE_B)
    c.rect(6,6,10,12,[200,180,255,200]).circle(6,18,10,[200,180,255,80])
  },
  'column' => -> {
    c=Canvas.new
    c.rect(6,6,13,13,STR_D).rect(5,5,13,13,STR_B).rect(5,5,13,2,[100,110,120,255])
  },
  'foundation' => -> {
    c=Canvas.new
    c.triangle([[7,5],[17,5],[22,19],[2,19]],STR_B).rect(2,19,20,3,STR_D)
    c.hline(5,7,17,[100,110,120,255],1)
  },
  'roof' => -> {
    c=Canvas.new
    c.triangle([[12,2],[23,19],[1,19]],ROOF_B).triangle([[12,5],[20,18],[4,18]],[250,200,80,255])
    c.rect(1,19,22,3,ROOF_D)
  },
  'gutter' => -> {
    c=Canvas.new
    c.rect(1,7,22,3,ROOF_B).rect(1,7,3,14,ROOF_B).rect(20,7,3,14,ROOF_B).rect(1,18,22,3,ROOF_D)
    c.rect(4,13,16,5,[100,180,255,180])
  },
  'roof_framing' => -> {
    c=Canvas.new
    c.triangle([[12,3],[22,20],[2,20]],STR_B)
    c.hline(14,4,20,STR_D,1)
    c.vline(12,4,14,STR_D,1)
    c.vline(7,8,14,STR_D,1).vline(17,8,14,STR_D,1)
    c.rect(2,20,20,2,STR_D)
    c
  },
  'roof_framing_edit' => -> {
    c=Canvas.new
    c.triangle([[12,2],[21,17],[3,17]],STR_B)
    c.hline(12,5,19,STR_D,1)
    c.vline(12,3,12,STR_D,1)
    c.rect(2,19,4,3,ROOF_B).rect(18,19,4,3,ROOF_B)
    c
  },
  'roof_hip_gable' => -> {
    c=Canvas.new
    c.triangle([[12,2],[23,19],[1,19]],ROOF_B)
    c.vline(12,2,19,ROOF_D,1)
    c.vline(6,10,19,[250,200,80,255],1).vline(18,10,19,[250,200,80,255],1)
    c.rect(1,19,22,3,ROOF_D)
    c
  },
  'roof_auto' => -> {
    c=Canvas.new
    c.triangle([[3,19],[12,6],[21,19]],ROOF_B)
    c.rect(1,19,22,3,ROOF_D)
    c.circle(18,7,4,ELEC_B)
    c.hline(7,15,21,W,1).vline(18,4,10,W,1)
    c
  },
  'surface' => -> {
    c=Canvas.new
    c.rect(2,2,20,20,[210,240,220,255])
    [2,7,12,17,22].each{|x|c.vline(x,2,21,SURF_D,1)}
    [2,7,12,17,22].each{|y|c.hline(y,2,21,SURF_D,1)}
    c.rect(8,8,4,4,SURF_B)
  },
  'manhole' => -> {
    c=Canvas.new
    c.circle(12,12,10,DRN_D).circle(12,12,9,DRN_B).circle(12,12,6,DRN_D)
    c.circle(12,12,5,[180,230,240,255])
    c.hline(12,3,21,DRN_D,1).vline(12,3,21,DRN_D,1)
  },
  'pipe' => -> {
    c=Canvas.new
    c.rect(2,9,20,8,DRN_D).rect(2,8,20,8,DRN_B).rect(2,8,20,2,[150,230,245,255])
    c.circle(2,12,5,DRN_D).circle(22,12,5,DRN_D)
  },
  'cable' => -> {
    c=Canvas.new
    c.rect(11,2,5,10,ELEC_B).rect(6,10,11,2,ELEC_B).rect(8,12,5,10,ELEC_B)
    c.rect(11,2,2,8,[255,160,160,255])
  },
  'panelboard' => -> {
    c=Canvas.new
    c.rect(4,3,17,19,ELEC_D).rect(3,2,16,19,ELEC_B).rect(3,2,16,4,ELEC_D)
    [7,11,15].each{|y|c.rect(5,y,8,2,W).rect(14,y,3,2,ELEC_D)}
    c
  },
  'cabinet' => -> {
    c=Canvas.new
    c.rect(2,5,20,14,INT_D).rect(2,4,20,14,INT_B).rect(2,4,20,2,[250,180,220,255])
    c.vline(12,4,18,INT_D,1)
    c.rect(7,10,3,2,W).rect(14,10,3,2,W)
    c.rect(2,18,20,3,INT_D)
  },
  'wardrobe' => -> {
    c=Canvas.new
    c.rect(3,2,18,20,INT_D).rect(4,2,16,20,INT_B)
    c.hline(7,4,19,INT_D,1).vline(12,2,21,INT_D,1)
    c.rect(5,8,5,9,[250,180,220,200]).rect(13,8,5,9,[250,180,220,200])
    c.rect(8,13,2,4,W).rect(14,13,2,4,W)
  },
  'asset' => -> {
    c=Canvas.new
    c.triangle([[12,2],[22,8],[12,13]],LIB_B)
    c.triangle([[12,2],[2,8],[12,13]],[220,140,60,255])
    c.triangle([[2,8],[12,13],[12,22],[2,17]],LIB_D)
    c.triangle([[22,8],[12,13],[12,22],[22,17]],[200,120,40,255])
    c.vline(12,2,22,LIB_D,1)
  },
  'costing' => -> {
    c=Canvas.new
    c.rect(5,3,15,19,CST_D).rect(4,2,15,19,CST_B).rect(4,2,15,4,CST_D)
    [7,10,13,16].each{|y|c.rect(6,y,10,1,W)}
    c.rect(8,18,2,3,W).rect(8,18,5,1,W).rect(8,20,4,1,W).rect(8,21,5,1,W)
  },

  # -- Structure (framing, beam, grid, rebar schedule) ----------------------
  'grid_framing' => -> {
    c=Canvas.new
    c.vline(6,3,20,STR_D,1).vline(17,3,20,STR_D,1)
    c.hline(6,3,20,STR_D,1).hline(17,3,20,STR_D,1)
    [[3,3],[14,3],[3,14],[14,14]].each{|x,y|c.rect(x,y,5,5,STR_B)}
    c
  },
  'beam' => -> {
    c=Canvas.new
    c.rect(2,10,20,5,STR_B).rect(2,10,20,2,[140,150,160,255])
    c.rect(3,15,3,6,STR_D).rect(18,15,3,6,STR_D)
    c.hline(20,2,21,STR_D,2)
    c
  },
  'grid' => -> {
    c=Canvas.new
    c.vline(6,3,21,STR_D,1).vline(12,3,21,STR_D,1).vline(18,3,21,STR_D,1)
    c.hline(6,3,21,STR_D,1).hline(12,3,21,STR_D,1).hline(18,3,21,STR_D,1)
    c.circle(6,6,2,STR_B).circle(18,18,2,STR_B)
    c
  },
  'rebar' => -> {
    c=Canvas.new
    c.rect(7,4,3,17,[170,80,60,255]).rect(14,4,3,17,[190,95,70,255])
    [6,11,16].each{|y|c.hline(y,5,19,[150,60,45,255],2)}
    c
  },
  'bbs' => -> {
    c=Canvas.new
    c.rect(3,3,18,18,CST_B).rect(3,3,18,4,CST_D)
    [10,14,18].each{|y|c.hline(y,5,19,W,1)}
    c.vline(9,7,21,W,1).vline(15,7,21,W,1)
    c
  },

  # -- Architecture (floor, ceiling, stair, curtain wall, rooms, finishes) --
  'floor' => -> {
    c=Canvas.new
    c.triangle([[2,9],[22,9],[17,18],[7,18]],SURF_B)
    c.rect(7,18,10,3,SURF_D)
    c.hline(9,2,22,[220,250,235,255],1)
    c
  },
  'ceiling' => -> {
    c=Canvas.new
    c.rect(3,6,18,4,[150,165,180,255]).rect(3,6,18,2,ARCH_D)
    c.vline(7,2,6,ARCH_D,1).vline(12,2,6,ARCH_D,1).vline(17,2,6,ARCH_D,1)
    c.hline(2,7,17,ARCH_D,1)
    c
  },
  'stair' => -> {
    c=Canvas.new
    [[3,17],[7,14],[11,11],[15,8],[19,5]].each{|x,y|c.rect(x,y,4,4,STR_B).rect(x,y,4,1,STR_D)}
    c.rect(2,21,20,2,STR_D)
    c
  },
  'curtain_wall' => -> {
    c=Canvas.new
    c.rect(2,2,20,20,[180,215,240,180])
    c.vline(2,2,21,ARCH_D,1).vline(8,2,21,ARCH_D,1).vline(14,2,21,ARCH_D,1).vline(21,2,21,ARCH_D,1)
    c.hline(2,2,21,ARCH_D,1).hline(8,2,21,ARCH_D,1).hline(14,2,21,ARCH_D,1).hline(21,2,21,ARCH_D,1)
    c.rect(2,2,2,20,ARCH_B).rect(20,2,2,20,ARCH_B)
    c
  },
  'curtain_wall_edit' => -> {
    c=Canvas.new
    c.rect(2,2,15,20,[180,215,240,180])
    c.vline(7,2,21,ARCH_D,1).vline(12,2,21,ARCH_D,1)
    c.hline(7,2,16,ARCH_D,1).hline(13,2,16,ARCH_D,1)
    c.triangle([[13,23],[23,13],[23,23]],LIB_B)
    c
  },
  'room' => -> {
    c=Canvas.new
    c.rect(2,2,20,20,ARCH_D).rect(4,4,16,16,[220,232,245,255])
    c.rect(10,2,4,4,OPE_B)
    c
  },
  'paving' => -> {
    c=Canvas.new
    tiles=[[3,3,SURF_B],[11,3,SURF_D],[19,3,SURF_B],[3,11,SURF_D],[11,11,SURF_B],[19,11,SURF_D],[3,19,SURF_B],[11,19,SURF_D],[19,19,SURF_B]]
    tiles.each{|x,y,col|c.rect(x,y,6,6,col)}
    c
  },
  'profile_new' => -> {
    c=Canvas.new
    c.rect(3,5,10,8,STR_B).rect(3,5,10,2,STR_D)
    c.circle(18,16,5,CST_B)
    c.hline(16,15,21,W,2).vline(18,13,19,W,2)
    c
  },
  'profile_sweep' => -> {
    c=Canvas.new
    c.rect(2,19,20,3,ARCH_D)
    c.rect(3,14,14,5,LIB_B).rect(3,14,14,2,LIB_D)
    c.rect(15,7,6,12,INT_B).rect(15,7,6,2,INT_D)
    c
  },
  'profile_sweep_selection' => -> {
    c=Canvas.new
    c.hline(13,2,22,ROOF_B,2)
    c.rect(3,4,7,7,LIB_B).rect(3,4,7,2,LIB_D)
    c.triangle([[10,7],[21,2],[21,12]],LIB_D)
    c
  },

  # -- Drawing / annotation -------------------------------------------------
  'dimension' => -> {
    c=Canvas.new
    c.hline(12,4,20,CORE_B,2)
    c.triangle([[4,12],[9,8],[9,16]],CORE_B).triangle([[20,12],[15,8],[15,16]],CORE_B)
    c.vline(4,4,12,CORE_D,1).vline(20,4,12,CORE_D,1)
    c
  },
  'spot_elevation' => -> {
    c=Canvas.new
    c.hline(19,3,21,CORE_D,2)
    c.triangle([[12,4],[6,15],[18,15]],CORE_B)
    c.rect(10,7,4,4,W)
    c
  },
  'scenes' => -> {
    c=Canvas.new
    c.rect(5,8,14,13,CST_B).rect(5,8,14,3,CST_D)
    c.rect(8,3,14,13,[230,240,250,255]).rect(8,3,14,3,CST_D)
    c
  },
  'smart_stretch' => -> {
    c=Canvas.new
    c.rect(8,8,8,8,INT_B)
    c.triangle([[8,12],[2,8],[2,16]],CORE_B).triangle([[16,12],[22,8],[22,16]],CORE_B)
    c
  },
  'stretch_area' => -> {
    c=Canvas.new
    c.rect(4,4,16,16,[210,235,225,255])
    c.triangle([[12,12],[12,2],[20,6]],ROOF_B).triangle([[12,12],[2,6],[10,2]],ROOF_B)
    c
  },
  'laser_level' => -> {
    c=Canvas.new
    c.circle(4,12,3,ELEC_B).rect(3,10,4,4,ELEC_D)
    c.hline(12,8,22,ELEC_B,2)
    c
  },
  'array_face' => -> {
    c=Canvas.new
    [[3,10],[10,8],[17,6],[3,17],[10,15],[17,13]].each{|x,y|c.rect(x,y,6,4,SURF_B).rect(x,y,6,1,SURF_D)}
    c
  },
  'export_csv' => -> {
    c=Canvas.new
    c.rect(5,2,14,20,[210,220,230,255]).rect(5,2,14,3,CST_D)
    c.rect(7,8,10,1,CST_D).rect(7,11,10,1,CST_D)
    c.vline(20,12,19,CST_D,2).triangle([[17,19],[23,19],[20,23]],CST_B)
    c
  },
}.freeze

# ── Generate all ───────────────────────────────────────────────────────────────
ICONS.each do |name, builder|
  canvas = builder.call
  pixels = canvas.px
  File.binwrite(File.join(OUT, "#{name}.png"),    encode_png(pixels))
  File.binwrite(File.join(OUT, "#{name}@2x.png"), encode_png(scale(pixels, 2)))
  puts "  ✓ #{name}"
end
puts "\n#{ICONS.size * 2} files → #{OUT}"
