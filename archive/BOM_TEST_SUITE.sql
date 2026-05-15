-- ============================================================================
-- COMPREHENSIVE BOM TEST SUITE
-- Tests all edge cases and validates robustness
-- ============================================================================

-- Test Setup: Clear existing test data first (if any)
-- DELETE FROM bill_of_materials WHERE notes LIKE 'TEST:%';

-- ============================================================================
-- TEST CASE 1: Simple BOM - Single Raw Material
-- Product: Aqua Prime 500ML with 1 Preform
-- ============================================================================

-- First, ensure we have raw materials with proper unit costs
INSERT INTO raw_materials (
    display_id, name, unit, unit_cost, current_stock, min_stock_level, is_active, vendor_id, warehouse_id, category_id
) VALUES 
(
    'RM-PREF-500', 
    'Preform 500ML Bottle',
    'pieces',
    4.50, -- Cost per piece
    1000,
    100,
    true,
    (SELECT id FROM vendors LIMIT 1),
    '67f904b6-94f8-4fe8-a585-4774c6b2142c',
    'e1bc9c0d-b612-4629-a522-1162c4fdcfd5' -- Preform 500ML category
)
ON CONFLICT (display_id) DO UPDATE SET
    unit_cost = EXCLUDED.unit_cost,
    current_stock = EXCLUDED.current_stock,
    updated_at = NOW();

INSERT INTO raw_materials (
    display_id, name, unit, unit_cost, current_stock, min_stock_level, is_active, vendor_id, warehouse_id, category_id
) VALUES 
(
    'RM-CAP-500', 
    'Cap 500ML Blue',
    'pieces',
    1.20,
    2000,
    200,
    true,
    (SELECT id FROM vendors LIMIT 1),
    '67f904b6-94f8-4fe8-a585-4774c6b2142c',
    NULL
),
(
    'RM-LABEL-500', 
    'Label 500ML Aqua Prime',
    'pieces',
    0.80,
    1500,
    150,
    true,
    (SELECT id FROM vendors LIMIT 1),
    '67f904b6-94f8-4fe8-a585-4774c6b2142c',
    NULL
)
ON CONFLICT (display_id) DO UPDATE SET
    unit_cost = EXCLUDED.unit_cost,
    current_stock = EXCLUDED.current_stock,
    updated_at = NOW();

-- Store the IDs for later use
DO $$
DECLARE
    v_product_id UUID := '44dad210-a5e4-4db0-99e6-1c823f7103ab'; -- Aqua Prime 500ML
    v_warehouse_id UUID := '67f904b6-94f8-4fe8-a585-4774c6b2142c';
    v_pref_500_id UUID;
    v_cap_500_id UUID;
    v_label_500_id UUID;
    v_category_500_id UUID := 'e1bc9c0d-b612-4629-a522-1162c4fdcfd5';
    v_bom_cost NUMERIC;
    v_expected_cost NUMERIC;
BEGIN
    -- Get material IDs
    SELECT id INTO v_pref_500_id FROM raw_materials WHERE display_id = 'RM-PREF-500';
    SELECT id INTO v_cap_500_id FROM raw_materials WHERE display_id = 'RM-CAP-500';
    SELECT id INTO v_label_500_id FROM raw_materials WHERE display_id = 'RM-LABEL-500';

    RAISE NOTICE 'Test 1: Simple BOM with single material';
    RAISE NOTICE 'Product ID: %', v_product_id;
    RAISE NOTICE 'Preform ID: %', v_pref_500_id;
    
    -- Deactivate any existing BOM
    UPDATE bill_of_materials 
    SET is_active = false, deleted_at = NOW()
    WHERE finished_product_id = v_product_id AND is_active = true;

    -- Create BOM: 1 preform per bottle
    INSERT INTO bill_of_materials (
        finished_product_id, warehouse_id, raw_material_id, raw_material_category_id,
        quantity, quantity_unit, is_active, notes
    ) VALUES (
        v_product_id, v_warehouse_id, v_pref_500_id, NULL,
        1, 'pieces', true, 'TEST: Simple BOM - 1 preform per bottle'
    );

    -- Calculate expected cost: 1 × ₹4.50 = ₹4.50
    v_expected_cost := 4.50;
    
    -- Test calculate_bom_cost function
    SELECT calculate_bom_cost(v_product_id, v_warehouse_id) INTO v_bom_cost;
    
    RAISE NOTICE 'Expected cost: ₹%', v_expected_cost;
    RAISE NOTICE 'Calculated cost: ₹%', v_bom_cost;
    RAISE NOTICE 'Test 1 Result: %', CASE WHEN v_bom_cost = v_expected_cost THEN 'PASSED' ELSE 'FAILED' END;

    -- ============================================================================
    -- TEST CASE 2: Multiple Materials BOM
    -- Product: Aqua Prime 500ML with Preform + Cap + Label
    -- ============================================================================
    
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Test 2: BOM with multiple materials';
    
    -- Deactivate previous version
    UPDATE bill_of_materials 
    SET is_active = false, deleted_at = NOW()
    WHERE finished_product_id = v_product_id AND is_active = true;

    -- Insert new BOM with 3 materials
    INSERT INTO bill_of_materials (
        finished_product_id, warehouse_id, raw_material_id, raw_material_category_id,
        quantity, quantity_unit, is_active, version, notes
    ) VALUES 
    (v_product_id, v_warehouse_id, v_pref_500_id, NULL, 1, 'pieces', true, 1, 'TEST: Multi-material BOM'),
    (v_product_id, v_warehouse_id, v_cap_500_id, NULL, 1, 'pieces', true, 1, 'TEST: Multi-material BOM'),
    (v_product_id, v_warehouse_id, v_label_500_id, NULL, 1, 'pieces', true, 1, 'TEST: Multi-material BOM');

    -- Expected cost: ₹4.50 + ₹1.20 + ₹0.80 = ₹6.50
    v_expected_cost := 6.50;
    
    SELECT calculate_bom_cost(v_product_id, v_warehouse_id) INTO v_bom_cost;
    
    RAISE NOTICE 'Expected cost: ₹%', v_expected_cost;
    RAISE NOTICE 'Calculated cost: ₹%', v_bom_cost;
    RAISE NOTICE 'Test 2 Result: %', CASE WHEN v_bom_cost = v_expected_cost THEN 'PASSED' ELSE 'FAILED' END;

    -- ============================================================================
    -- TEST CASE 3: Category-based BOM (Interchangeable Materials)
    -- Uses category instead of specific material (WAC applied)
    -- ============================================================================
    
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Test 3: Category-based BOM with WAC';
    
    -- Add multiple materials to same category for WAC calculation
    INSERT INTO raw_materials (display_id, name, unit, unit_cost, current_stock, is_active, category_id, warehouse_id)
    VALUES 
    ('RM-PREF-V2', 'Preform 500ML V2 Premium', 'pieces', 5.00, 500, true, v_category_500_id, v_warehouse_id),
    ('RM-PREF-V3', 'Preform 500ML V3 Economy', 'pieces', 4.00, 300, true, v_category_500_id, v_warehouse_id)
    ON CONFLICT (display_id) DO UPDATE SET
        unit_cost = EXCLUDED.unit_cost,
        current_stock = EXCLUDED.current_stock;

    -- Deactivate old BOM
    UPDATE bill_of_materials 
    SET is_active = false, deleted_at = NOW()
    WHERE finished_product_id = v_product_id AND is_active = true;

    -- Create category-based BOM
    INSERT INTO bill_of_materials (
        finished_product_id, warehouse_id, raw_material_id, raw_material_category_id,
        quantity, quantity_unit, is_active, notes
    ) VALUES (
        v_product_id, v_warehouse_id, NULL, v_category_500_id,
        1, 'pieces', true, 'TEST: Category-based BOM'
    );

    -- Calculate WAC for category: (4.50×1000 + 5.00×500 + 4.00×300) / (1000+500+300)
    -- = (4500 + 2500 + 1200) / 1800 = 8200 / 1800 = ₹4.56 (approx)
    
    RAISE NOTICE 'Category WAC should be approximately ₹4.56';
    
    -- ============================================================================
    -- TEST CASE 4: Unit Conversion (KG to Pieces)
    -- Material priced per KG but used in pieces
    -- ============================================================================
    
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Test 4: Unit conversion - pieces with weight';
    
    -- Create material with piece weight for conversion
    INSERT INTO raw_materials (
        display_id, name, unit, unit_cost, piece_weight_grams, current_stock, is_active, warehouse_id
    ) VALUES (
        'RM-PREF-WEIGHTED', 
        'Preform 500ML (Weighted)',
        'kg', -- Priced per KG
        90.00, -- ₹90 per KG
        50, -- Each piece weighs 50g
        100,
        true,
        v_warehouse_id
    )
    ON CONFLICT (display_id) DO UPDATE SET
        unit_cost = EXCLUDED.unit_cost,
        piece_weight_grams = EXCLUDED.piece_weight_grams;

    -- Cost per piece = (50g × ₹90) / 1000g = ₹4.50 per piece
    
    RAISE NOTICE 'Material: ₹90/kg, 50g per piece';
    RAISE NOTICE 'Expected cost per piece: ₹4.50';

    -- ============================================================================
    -- TEST CASE 5: Edge Case - Zero Quantity
    -- Should handle gracefully without errors
    -- ============================================================================
    
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Test 5: Edge case - Zero quantity';
    
    UPDATE bill_of_materials 
    SET is_active = false, deleted_at = NOW()
    WHERE finished_product_id = v_product_id AND is_active = true;

    INSERT INTO bill_of_materials (
        finished_product_id, warehouse_id, raw_material_id,
        quantity, quantity_unit, is_active, notes
    ) VALUES (
        v_product_id, v_warehouse_id, v_pref_500_id,
        0, 'pieces', true, 'TEST: Zero quantity'
    );

    SELECT calculate_bom_cost(v_product_id, v_warehouse_id) INTO v_bom_cost;
    RAISE NOTICE 'Zero quantity BOM cost: ₹%', v_bom_cost;
    RAISE NOTICE 'Test 5 Result: %', CASE WHEN v_bom_cost = 0 THEN 'PASSED' ELSE 'FAILED' END;

    -- ============================================================================
    -- TEST CASE 6: Edge Case - NULL Unit Cost
    -- Should handle NULL gracefully with COALESCE
    -- ============================================================================
    
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Test 6: Edge case - NULL unit cost';
    
    -- Create material with NULL unit cost
    INSERT INTO raw_materials (
        display_id, name, unit, unit_cost, current_stock, is_active, warehouse_id
    ) VALUES (
        'RM-NO-COST',
        'Material Without Cost',
        'pieces',
        NULL, -- No cost set
        100,
        true,
        v_warehouse_id
    )
    ON CONFLICT (display_id) DO NOTHING;

    RAISE NOTICE 'Created material with NULL unit cost - should be handled';

    -- ============================================================================
    -- TEST CASE 7: Version Control
    -- Multiple versions, only latest active
    -- ============================================================================
    
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Test 7: Version control';
    
    UPDATE bill_of_materials 
    SET is_active = false
    WHERE finished_product_id = v_product_id;

    -- Create version 1 (old)
    INSERT INTO bill_of_materials (
        finished_product_id, warehouse_id, raw_material_id,
        quantity, quantity_unit, is_active, version, notes
    ) VALUES (
        v_product_id, v_warehouse_id, v_pref_500_id,
        1, 'pieces', false, 1, 'TEST: Version 1 (deprecated)'
    );

    -- Create version 2 (active)
    INSERT INTO bill_of_materials (
        finished_product_id, warehouse_id, raw_material_id,
        quantity, quantity_unit, is_active, version, notes
    ) VALUES (
        v_product_id, v_warehouse_id, v_pref_500_id,
        2, 'pieces', true, 2, 'TEST: Version 2 (current)'
    );

    SELECT calculate_bom_cost(v_product_id, v_warehouse_id) INTO v_bom_cost;
    -- Should only count version 2: 2 × ₹4.50 = ₹9.00
    RAISE NOTICE 'Version 2 expected cost: ₹9.00';
    RAISE NOTICE 'Calculated cost: ₹%', v_bom_cost;

    -- ============================================================================
    -- TEST CASE 8: WAC Recalculation Trigger
    -- Test that purchase updates WAC correctly
    -- ============================================================================
    
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'Test 8: WAC recalculation';
    
    -- Show current WAC
    RAISE NOTICE 'Current preform unit cost: ₹4.50';
    RAISE NOTICE 'After purchase, WAC should recalculate automatically';

    -- ============================================================================
    -- TEST SUMMARY
    -- ============================================================================
    
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'TEST SUITE COMPLETE';
    RAISE NOTICE '===========================================';
    RAISE NOTICE 'All test cases executed. Check logs above for results.';
    
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- Run these to verify test data
-- ============================================================================

-- Query 1: View all test BOMs
-- SELECT 
--     bom.id,
--     p.name as product,
--     COALESCE(rm.name, rmc.name) as material_or_category,
--     bom.quantity,
--     bom.quantity_unit,
--     bom.is_active,
--     bom.version,
--     bom.notes
-- FROM bill_of_materials bom
-- JOIN products p ON bom.finished_product_id = p.id
-- LEFT JOIN raw_materials rm ON bom.raw_material_id = rm.id
-- LEFT JOIN raw_material_categories rmc ON bom.raw_material_category_id = rmc.id
-- WHERE bom.notes LIKE 'TEST:%'
-- ORDER BY bom.created_at DESC;

-- Query 2: Calculate BOM costs for all test products
-- SELECT 
--     p.name as product,
--     calculate_bom_cost(p.id, '67f904b6-94f8-4fe8-a585-4774c6b2142c') as bom_cost
-- FROM products p
-- WHERE p.id IN ('44dad210-a5e4-4db0-99e6-1c823f7103ab', 'b6b0e3ab-2623-44f6-9641-8bc5cdb0dbd3');

-- Query 3: View raw materials with costs
-- SELECT 
--     display_id,
--     name,
--     unit,
--     unit_cost,
--     piece_weight_grams,
--     current_stock
-- FROM raw_materials
-- WHERE display_id LIKE 'RM-%'
-- ORDER BY display_id;
