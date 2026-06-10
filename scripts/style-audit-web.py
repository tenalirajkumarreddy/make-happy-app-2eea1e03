import json
import re
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

INCLUDE_EXT = {".ts", ".tsx", ".js", ".jsx", ".css", ".scss", ".sass", ".less"}
EXCLUDE_DIR_PARTS = {"mobile", "test", "__tests__"}


def is_web_file(path: Path) -> bool:
    if path.suffix.lower() not in INCLUDE_EXT:
        return False
    rel = path.relative_to(SRC)
    if any(part in EXCLUDE_DIR_PARTS for part in rel.parts):
        return False
    if rel.name.endswith(".test.ts") or rel.name.endswith(".test.tsx"):
        return False
    return True


def walk_files():
    for p in SRC.rglob("*"):
        if p.is_file() and is_web_file(p):
            yield p


def line_index(text: str):
    starts = [0]
    for m in re.finditer(r"\n", text):
        starts.append(m.end())
    return starts


def line_for(pos: int, starts):
    lo, hi = 0, len(starts) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if starts[mid] <= pos:
            lo = mid + 1
        else:
            hi = mid - 1
    return hi + 1


def collect_with_locations(pattern, text, starts, rel_path, normalize=lambda x: x):
    out = []
    iterator = pattern.finditer(text) if hasattr(pattern, "finditer") else re.finditer(pattern, text, flags=re.IGNORECASE)
    for m in iterator:
        raw = m.group(0)
        val = normalize(raw)
        out.append((val, f"{rel_path}:{line_for(m.start(), starts)}"))
    return out


COLOR_PATTERN = re.compile(
    r"#[0-9A-Fa-f]{3,8}\b|(?:rgb|hsl)a?\([^\)]*\)|\b(?:white|black|red|green|blue|gray|grey|transparent)\b|var\(--[A-Za-z0-9_-]+\)",
    re.IGNORECASE,
)

FONT_SIZE_PATTERN = re.compile(r"\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)\b|\btext-\[([^\]]+)\]")
FONT_WEIGHT_PATTERN = re.compile(r"\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b|\bfont-\[([^\]]+)\]")
LINE_HEIGHT_PATTERN = re.compile(r"\bleading-(none|tight|snug|normal|relaxed|loose|\d+)\b|\bleading-\[([^\]]+)\]")
FONT_FAMILY_PATTERN = re.compile(r"\bfont-(sans|serif|mono)\b")

SPACING_PATTERN = re.compile(
    r"\b(?:m|mx|my|mt|mr|mb|ml|p|px|py|pt|pr|pb|pl|gap|space-x|space-y)-\[[^\]]+\]|\b(?:m|mx|my|mt|mr|mb|ml|p|px|py|pt|pr|pb|pl|gap|space-x|space-y)-\d+(?:\.5)?\b|\b(?:margin|padding|gap|column-gap|row-gap)\s*:\s*[^;]+;",
    re.IGNORECASE,
)

RADIUS_PATTERN = re.compile(
    r"\brounded(?:-[trblxyse])?(?:-[a-z0-9]+)?\b|\brounded-\[[^\]]+\]|\bborder-radius\s*:\s*[^;]+;",
    re.IGNORECASE,
)

SHADOW_PATTERN = re.compile(r"\bshadow(?:-[a-z0-9]+)?\b|\bshadow-\[[^\]]+\]|\bbox-shadow\s*:\s*[^;]+;", re.IGNORECASE)

CLASSNAME_PATTERN = re.compile(r"className\s*=\s*\"([^\"]+)\"|className\s*=\s*\{`([^`]+)`\}")


def token_from_match(match):
    for g in match.groups():
        if g:
            return g
    return ""


def normalize_typo_token(kind: str, token: str) -> str:
    if kind == "size" and token.startswith("text-"):
        return token[len("text-") :]
    if kind == "weight" and token.startswith("font-"):
        return token[len("font-") :]
    if kind == "line_height" and token.startswith("leading-"):
        return token[len("leading-") :]
    if kind == "family" and token.startswith("font-"):
        return token[len("font-") :]
    return token


def main():
    colors = Counter()
    colors_where = defaultdict(list)

    spacing = Counter()
    spacing_where = defaultdict(list)

    radius = Counter()
    radius_where = defaultdict(list)

    shadows = Counter()
    shadows_where = defaultdict(list)

    typography = Counter()
    typography_where = defaultdict(list)

    components = defaultdict(set)
    ui_files = list((SRC / "components" / "ui").glob("*.tsx"))

    for file_path in walk_files():
        rel = file_path.relative_to(ROOT).as_posix()
        text = file_path.read_text(encoding="utf-8", errors="ignore")
        starts = line_index(text)

        for val, loc in collect_with_locations(COLOR_PATTERN, text, starts, rel, lambda s: s.strip()):
            colors[val] += 1
            if len(colors_where[val]) < 5:
                colors_where[val].append(loc)

        for val, loc in collect_with_locations(SPACING_PATTERN, text, starts, rel, lambda s: s.strip()):
            spacing[val] += 1
            if len(spacing_where[val]) < 5:
                spacing_where[val].append(loc)

        for val, loc in collect_with_locations(RADIUS_PATTERN, text, starts, rel, lambda s: s.strip()):
            radius[val] += 1
            if len(radius_where[val]) < 5:
                radius_where[val].append(loc)

        for val, loc in collect_with_locations(SHADOW_PATTERN, text, starts, rel, lambda s: s.strip()):
            shadows[val] += 1
            if len(shadows_where[val]) < 5:
                shadows_where[val].append(loc)

        # Typography from className snippets
        for m in CLASSNAME_PATTERN.finditer(text):
            class_block = m.group(1) or m.group(2) or ""
            size = ""
            weight = ""
            line_height = ""
            family = ""

            for t in class_block.split():
                m_size = re.match(r"^text-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$", t)
                m_size_arb = re.match(r"^text-\[[^\]]+\]$", t)
                m_weight = re.match(r"^font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$", t)
                m_weight_arb = re.match(r"^font-\[[^\]]+\]$", t)
                m_lh = re.match(r"^leading-(?:none|tight|snug|normal|relaxed|loose|\d+)$", t)
                m_lh_arb = re.match(r"^leading-\[[^\]]+\]$", t)
                m_family = re.match(r"^font-(?:sans|serif|mono)$", t)

                if m_size or m_size_arb:
                    size = normalize_typo_token("size", t)
                if m_weight or m_weight_arb:
                    weight = normalize_typo_token("weight", t)
                if m_lh or m_lh_arb:
                    line_height = normalize_typo_token("line_height", t)
                if m_family:
                    family = normalize_typo_token("family", t)

            if size or weight or line_height or family:
                key = {
                    "size": size or "(inherit)",
                    "weight": weight or "(inherit)",
                    "line_height": line_height or "(inherit)",
                    "family": family or "(inherit)",
                }
                key_s = json.dumps(key, sort_keys=True)
                line = line_for(m.start(), starts)
                typography[key_s] += 1
                if len(typography_where[key_s]) < 5:
                    typography_where[key_s].append(f"{rel}:{line}")

        # component usage by JSX tags
        if file_path.suffix in {".tsx", ".jsx"}:
            for comp in [
                "Button",
                "Input",
                "Card",
                "Badge",
                "Dialog",
                "Toast",
                "Tooltip",
                "DropdownMenu",
                "Avatar",
                "Checkbox",
                "RadioGroup",
                "Switch",
                "Tabs",
                "Select",
                "Sheet",
                "Spinner",
            ]:
                if re.search(rf"<{comp}(?:\s|>)", text):
                    components[comp].add(rel)

    inventory = []
    for ui_file in sorted(ui_files):
        name = ui_file.stem
        content = ui_file.read_text(encoding="utf-8", errors="ignore")
        has_hover = "hover:" in content
        has_focus = "focus:" in content or "focus-visible:" in content
        has_active = "active:" in content or "data-[state=active]" in content
        has_disabled = "disabled:" in content or "disabled" in content
        has_loading = "loading" in content.lower() or "animate-spin" in content
        variant_count = content.count("variant:") + content.count("variants:")
        inventory.append(
            {
                "component": name,
                "variants_detected": variant_count,
                "shared_component": True,
                "states": {
                    "hover": has_hover,
                    "focus": has_focus,
                    "active": has_active,
                    "disabled": has_disabled,
                    "loading": has_loading,
                },
            }
        )

    out = {
        "colors": [
            {"value": k, "count": v, "where": colors_where[k]} for k, v in colors.most_common()
        ],
        "typography": [
            {
                **json.loads(k),
                "count": v,
                "where": typography_where[k],
            }
            for k, v in typography.most_common()
        ],
        "spacing": [
            {"value": k, "count": v, "where": spacing_where[k]} for k, v in spacing.most_common()
        ],
        "radius": [
            {"value": k, "count": v, "where": radius_where[k]} for k, v in radius.most_common()
        ],
        "shadows": [
            {"value": k, "count": v, "where": shadows_where[k]} for k, v in shadows.most_common()
        ],
        "component_usage": [
            {"component": k, "files": len(v), "examples": sorted(list(v))[:5]} for k, v in sorted(components.items())
        ],
        "ui_inventory": inventory,
    }

    out_path = ROOT / "style-audit-web.json"
    out_path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    print(str(out_path))


if __name__ == "__main__":
    main()
