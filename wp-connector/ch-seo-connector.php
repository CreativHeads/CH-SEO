<?php
 /**
  * Plugin Name: CreativHeads SEO Connector
 * Description: Small, reviewed bridge for SEO Studio: reads and writes SEO titles, meta descriptions, H1 headings
 *              (including Elementor), noindex and canonical through the active SEO plugin (Yoast or Rank Math),
 *              adds JSON-LD schema, and serves 301 redirects for URLs that would otherwise 404.
 *              No outbound calls, no tracking, no settings page.
 * Version:     1.2.0
  * Author:      DIGI CREATIVHEADS LLP
  * Requires PHP: 7.4
  */
 if ( ! defined( 'ABSPATH' ) ) { exit; }

 const CH_SEO_VERSION = '1.2.0';
 const CH_SEO_CAP     = 'ch_seo_manage';   // needed for redirects and site schema

 register_activation_hook( __FILE__, function () {
      $role = get_role( 'administrator' );
      if ( $role ) { $role->add_cap( CH_SEO_CAP ); }
 } );

 function ch_seo_plugin() {
     if ( defined( 'WPSEO_VERSION' ) ) { return 'yoast'; }
     if ( class_exists( 'RankMath' ) || defined( 'RANK_MATH_VERSION' ) ) { return 'rank_math'; }
     return 'none';
 }

 function ch_seo_arr( $v ) { return is_array( $v ) ? $v : array(); }

 function ch_seo_can_edit( WP_REST_Request $r ) { return current_user_can( 'edit_post', (int) $r['id'] ); }
 function ch_seo_can_manage() { return current_user_can( CH_SEO_CAP ); }

 function ch_seo_get_meta( $id ) {
     $p = ch_seo_plugin();
     if ( 'yoast' === $p ) {
         return array(
             'plugin'      => $p,
             'title'       => (string) get_post_meta( $id, '_yoast_wpseo_title', true ),
             'description' => (string) get_post_meta( $id, '_yoast_wpseo_metadesc', true ),
             'noindex'     => '1' === get_post_meta( $id, '_yoast_wpseo_meta-robots-noindex', true ),
             'canonical'   => (string) get_post_meta( $id, '_yoast_wpseo_canonical', true ),
         );
     }
     if ( 'rank_math' === $p ) {
         $robots = ch_seo_arr( get_post_meta( $id, 'rank_math_robots', true ) );
         return array(
             'plugin'      => $p,
             'title'       => (string) get_post_meta( $id, 'rank_math_title', true ),
             'description' => (string) get_post_meta( $id, 'rank_math_description', true ),
             'noindex'     => in_array( 'noindex', $robots, true ),
             'canonical'   => (string) get_post_meta( $id, 'rank_math_canonical_url', true ),
         );
     }
     return array( 'plugin' => 'none', 'title' => '', 'description' => '', 'noindex' => false, 'canonical' => '' );
 }

 add_action( 'rest_api_init', function () {
     register_rest_route( 'ch-seo/v1', '/info', array(
         'methods'             => 'GET',
         'permission_callback' => function () { return current_user_can( 'edit_posts' ); },
         'callback'            => function () {
             $theme = wp_get_theme();
             return array(
                 'connector'   => CH_SEO_VERSION,
                 'wp'          => get_bloginfo( 'version' ),
                 'seo_plugin' => ch_seo_plugin(),
                 'woocommerce' => class_exists( 'WooCommerce' ),
                 'cache'       => array_values( array_filter( array(
                     defined( 'LSCWP_V' ) ? 'litespeed-cache' : null,
                     defined( 'WP_ROCKET_VERSION' ) ? 'wp-rocket' : null,
                     defined( 'W3TC' ) ? 'w3-total-cache' : null,
                     defined( 'WPCACHEHOME' ) ? 'wp-super-cache' : null,
                 ) ) ),
                 'builder'     => defined( 'ELEMENTOR_VERSION' ) ? 'elementor' : null,
                 'redirection' => defined( 'REDIRECTION_VERSION' ),
                 'theme'       => $theme->get( 'Name' ),
                 'can_manage' => ch_seo_can_manage(),
             );
         },
     ) );

     register_rest_route( 'ch-seo/v1', '/seo-meta/(?P<id>\d+)', array(
         array( 'methods' => 'GET', 'permission_callback' => 'ch_seo_can_edit',
             'callback' => function ( WP_REST_Request $r ) { return ch_seo_get_meta( (int) $r['id'] ); } ),
         array( 'methods' => 'POST', 'permission_callback' => 'ch_seo_can_edit',
             'callback' => function ( WP_REST_Request $r ) {
                 $id = (int) $r['id'];
                 if ( ! get_post( $id ) ) { return new WP_Error( 'not_found', 'No such post', array( 'status' => 404 ) ); }
                 $p = ch_seo_plugin();
                 if ( 'none' === $p ) { return new WP_Error( 'no_seo_plugin', 'Yoast or Rank Math is required', array( 'status' => 409 ) ); }
                 $before = ch_seo_get_meta( $id );
                 $keys   = 'yoast' === $p
                     ? array( 'title' => '_yoast_wpseo_title', 'description' => '_yoast_wpseo_metadesc' )
                     : array( 'title' => 'rank_math_title', 'description' => 'rank_math_description' );
                 foreach ( $keys as $field => $meta_key ) {
                     if ( null !== $r->get_param( $field ) ) {
                         update_post_meta( $id, $meta_key, sanitize_text_field( (string) $r->get_param( $field ) ) );





                          }
                      }
                      if ( null !== $r->get_param( 'canonical' ) ) {   // empty string removes the custom canonical
                          $canonical = esc_url_raw( (string) $r->get_param( 'canonical' ) );
                          if ( '' !== $canonical && wp_validate_redirect( $canonical, '' ) !== $canonical ) {
                              return new WP_Error( 'bad_canonical', 'canonical must be on this site', array( 'status' => 400 ) );
                          }
                          update_post_meta( $id, 'yoast' === $p ? '_yoast_wpseo_canonical' : 'rank_math_canonical_url', $canonical );
                      }
                      if ( null !== $r->get_param( 'noindex' ) ) {
                          $noindex = rest_sanitize_boolean( $r->get_param( 'noindex' ) );
                          if ( 'yoast' === $p ) {
                              update_post_meta( $id, '_yoast_wpseo_meta-robots-noindex', $noindex ? '1' : '0' );
                          } else {
                              $robots = array_values( array_diff( ch_seo_arr( get_post_meta( $id, 'rank_math_robots', true ) ), array( 'index', 'noindex' )
               ) );
                             $robots[] = $noindex ? 'noindex' : 'index';
                             update_post_meta( $id, 'rank_math_robots', $robots );
                         }
                      }
                      clean_post_cache( $id );
                      do_action( 'ch_seo_meta_updated', $id );   // cache plugins can hook this; SEO Studio also verifies the live page
                      return array( 'before' => $before, 'after' => ch_seo_get_meta( $id ) );
                  } ),
        ) );

        register_rest_route( 'ch-seo/v1', '/schema/(?P<id>\d+)', array(
            array( 'methods' => 'GET', 'permission_callback' => 'ch_seo_can_edit',
                'callback' => function ( WP_REST_Request $r ) { return ch_seo_arr( get_post_meta( (int) $r['id'], '_ch_seo_schema', true ) ); } ),
            array( 'methods' => 'POST', 'permission_callback' => 'ch_seo_can_edit',
                'callback' => function ( WP_REST_Request $r ) {
                    $id    = (int) $r['id'];
                    $items = $r->get_param( 'items' );   // array of JSON-LD objects; empty array removes all
                    if ( ! is_array( $items ) || count( $items ) > 10 ) {
                        return new WP_Error( 'bad_items', 'items must be an array of up to 10 JSON-LD objects', array( 'status' => 400 ) );
                    }
                    foreach ( $items as $item ) {
                        if ( ! is_array( $item ) || empty( $item['@context'] ) || empty( $item['@type'] ) ) {
                            return new WP_Error( 'bad_item', 'Each item needs @context and @type', array( 'status' => 400 ) );
                        }
                    }
                    $before = ch_seo_arr( get_post_meta( $id, '_ch_seo_schema', true ) );
                    update_post_meta( $id, '_ch_seo_schema', $items );
                    clean_post_cache( $id );
                    return array( 'before' => $before, 'after' => $items );
                } ),
        ) );

        register_rest_route( 'ch-seo/v1', '/schema-site', array(
            array( 'methods' => 'GET', 'permission_callback' => 'ch_seo_can_manage',
                'callback' => function () { return ch_seo_arr( get_option( 'ch_seo_site_schema', array() ) ); } ),
            array( 'methods' => 'POST', 'permission_callback' => 'ch_seo_can_manage',
                'callback' => function ( WP_REST_Request $r ) {
                    $items = $r->get_param( 'items' );
                    if ( ! is_array( $items ) || count( $items ) > 5 ) {
                        return new WP_Error( 'bad_items', 'items must be an array of up to 5 JSON-LD objects', array( 'status' => 400 ) );
                    }
                    $before = ch_seo_arr( get_option( 'ch_seo_site_schema', array() ) );
                    update_option( 'ch_seo_site_schema', $items, false );
                    return array( 'before' => $before, 'after' => $items );
                } ),
        ) );

        register_rest_route( 'ch-seo/v1', '/redirects', array(
            array( 'methods' => 'GET', 'permission_callback' => 'ch_seo_can_manage',
                'callback' => function () { return ch_seo_arr( get_option( 'ch_seo_redirects', array() ) ); } ),
            array( 'methods' => 'POST', 'permission_callback' => 'ch_seo_can_manage',
                'callback' => function ( WP_REST_Request $r ) {
                    $from = ch_seo_norm_path( (string) $r->get_param( 'from' ) );
                    $to   = esc_url_raw( (string) $r->get_param( 'to' ) );
                    $all = ch_seo_arr( get_option( 'ch_seo_redirects', array() ) );
                    if ( '' === $from || '/' === $from ) {
                        return new WP_Error( 'bad_from', 'from must be a path like /old-page/', array( 'status' => 400 ) );
                    }
                    if ( '' === $r->get_param( 'to' ) ) {   // empty "to" deletes (used by rollback)
                        $before = $all[ $from ] ?? null;
                        unset( $all[ $from ] );
                        update_option( 'ch_seo_redirects', $all, false );
                        return array( 'before' => $before, 'after' => null );
                    }
                    if ( '' === $to || wp_validate_redirect( $to, '' ) !== $to ) {
                        return new WP_Error( 'bad_to', 'to must be on this site', array( 'status' => 400 ) );
                    }
                    if ( count( $all ) >= 2000 && ! isset( $all[ $from ] ) ) {
                        return new WP_Error( 'too_many', 'Redirect limit reached (2000)', array( 'status' => 409 ) );
                    }
                    $before       = $all[ $from ] ?? null;
                    $all[ $from ] = array( 'to' => $to, 'code' => 301, 'created' => gmdate( 'c' ) );
                    update_option( 'ch_seo_redirects', $all, false );
                    return array( 'before' => $before, 'after' => $all[ $from ] );
                } ),
        ) );
 } );

 // Links inside a page: list them, and swap exact link targets (normal content and Elementor layouts).
 function ch_seo_is_builder( $id ) { return 'builder' === get_post_meta( $id, '_elementor_edit_mode', true ); }
 function ch_seo_links_in( $id ) {
     $urls = array();
     $post = get_post( $id );
     if ( $post && preg_match_all( '/href\s*=\s*["\']([^"\']+)["\']/i', (string) $post->post_content, $m ) ) { $urls = array_merge( $urls, $m[1] ); }
     $el = (string) get_post_meta( $id, '_elementor_data', true );
     if ( '' !== $el && preg_match_all( '/"url":"((?:[^"\\\\]|\\\\.)*)"/', $el, $m ) ) {
         foreach ( $m[1] as $u ) { $urls[] = str_replace( '\/', '/', $u ); }
     }
     return array_values( array_unique( array_filter( array_map( 'html_entity_decode', $urls ) ) ) );
 }
 add_action( 'rest_api_init', function () {
     register_rest_route( 'ch-seo/v1', '/links/(?P<id>\d+)', array(
         array( 'methods' => 'GET', 'permission_callback' => 'ch_seo_can_edit',
             'callback' => function ( WP_REST_Request $r ) {
                 $id = (int) $r['id'];
                 if ( ! get_post( $id ) ) { return new WP_Error( 'not_found', 'No such post', array( 'status' => 404 ) ); }
                 return array( 'builder' => ch_seo_is_builder( $id ), 'urls' => ch_seo_links_in( $id ) );
             } ),
         array( 'methods' => 'POST', 'permission_callback' => 'ch_seo_can_edit',
             'callback' => function ( WP_REST_Request $r ) {
                 $id   = (int) $r['id'];
                 $post = get_post( $id );
                 if ( ! $post ) { return new WP_Error( 'not_found', 'No such post', array( 'status' => 404 ) ); }
                 $list = $r->get_param( 'replacements' );
                 if ( ! is_array( $list ) || ! $list || count( $list ) > 200 ) {
                     return new WP_Error( 'bad_list', 'replacements must be 1-200 {from,to} pairs', array( 'status' => 400 ) );
                 }
                 $content = (string) $post->post_content;
                 $el      = (string) get_post_meta( $id, '_elementor_data', true );
                 $changed = 0;
                 foreach ( $list as $pair ) {
                     $from = is_array( $pair ) ? (string) ( $pair['from'] ?? '' ) : '';
                     $to   = is_array( $pair ) ? esc_url_raw( (string) ( $pair['to'] ?? '' ) ) : '';
                     if ( '' === $from || '' === $to || wp_validate_redirect( $to, '' ) !== $to ) {
                         return new WP_Error( 'bad_pair', 'Each link must move to a page on this site', array( 'status' => 400 ) );
                     }
                     foreach ( array( '"', "'" ) as $q ) {
                         $content = str_replace( 'href=' . $q . $from . $q, 'href=' . $q . $to . $q, $content, $n ); $changed += $n;
                         $content = str_replace( 'href=' . $q . esc_attr( $from ) . $q, 'href=' . $q . esc_attr( $to ) . $q, $content, $n ); $changed += $n;
                     }
                     if ( '' !== $el ) {
                         $el = str_replace( '"' . str_replace( '/', '\/', $from ) . '"', '"' . str_replace( '/', '\/', $to ) . '"', $el, $n ); $changed += $n;
                         $el = str_replace( '"' . $from . '"', '"' . $to . '"', $el, $n ); $changed += $n;
                     }
                 }
                 if ( $content !== (string) $post->post_content ) {
                     wp_update_post( wp_slash( array( 'ID' => $id, 'post_content' => $content ) ) );
                 }
                 if ( '' !== $el && $el !== (string) get_post_meta( $id, '_elementor_data', true ) ) {
                     update_post_meta( $id, '_elementor_data', wp_slash( $el ) );
                     delete_post_meta( $id, '_elementor_css' );
                     if ( class_exists( '\Elementor\Plugin' ) ) { \Elementor\Plugin::$instance->files_manager->clear_cache(); }
                 }
                 clean_post_cache( $id );
                 do_action( 'ch_seo_meta_updated', $id );
                 return array( 'changed' => $changed, 'urls' => ch_seo_links_in( $id ) );
             } ),
     ) );
 } );

 function ch_seo_norm_path( $url ) {
     $path = (string) wp_parse_url( $url, PHP_URL_PATH );
     $path = '/' . trim( strtolower( rawurldecode( $path ) ), '/' );
     return '/' === $path ? '/' : $path . '/';
 }

 // Serve redirects only when WordPress would show a 404, so a real page is never overridden.
 add_action( 'template_redirect', function () {
     if ( ! is_404() ) { return; }
     $all = ch_seo_arr( get_option( 'ch_seo_redirects', array() ) );
     $path = ch_seo_norm_path( $_SERVER['REQUEST_URI'] ?? '' );
     if ( isset( $all[ $path ]['to'] ) ) {
         wp_safe_redirect( $all[ $path ]['to'], 301, 'CreativHeads SEO' );
         exit;
     }
 }, 1 );

 // Print JSON-LD added by SEO Studio. JSON_HEX_TAG stops a value from closing the script tag.
 add_action( 'wp_head', function () {
     $items = array();
     if ( is_front_page() ) { $items = array_merge( $items, ch_seo_arr( get_option( 'ch_seo_site_schema', array() ) ) ); }
     if ( is_singular() )   { $items = array_merge( $items, ch_seo_arr( get_post_meta( get_queried_object_id(), '_ch_seo_schema', true ) ) ); }
     foreach ( $items as $item ) {
         if ( is_array( $item ) && ! empty( $item['@type'] ) ) {
             echo "\n<script type=\"application/ld+json\">" .
                 wp_json_encode( $item, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG ) . "</script>\n";
         }
     }
 }, 30 );

 // H1 headings, including Elementor. Approving an H1 fix writes here; rollback sends an empty value.
 function ch_seo_el_elements( $id ) {
     $raw = get_post_meta( $id, '_elementor_data', true );
     if ( is_array( $raw ) ) { return $raw; }
     if ( ! is_string( $raw ) || '' === $raw ) { return array(); }
     $data = json_decode( $raw, true );
     return is_array( $data ) ? $data : array();
 }
 function ch_seo_el_save( $id, $elements ) {
     update_post_meta( $id, '_elementor_data', wp_slash( wp_json_encode( $elements ) ) );
     delete_post_meta( $id, '_elementor_css' );
     if ( class_exists( '\Elementor\Plugin' ) ) { \Elementor\Plugin::$instance->files_manager->clear_cache(); }
 }
 function ch_seo_el_is_heading( $el ) {
     $type = isset( $el['widgetType'] ) ? $el['widgetType'] : '';
     return 'heading' === $type || 'theme-post-title' === $type;
 }
 function ch_seo_el_heading_info( $elements ) {
     foreach ( $elements as $el ) {
         if ( ! is_array( $el ) ) { continue; }
         if ( ch_seo_el_is_heading( $el ) ) {
             $s = isset( $el['settings'] ) && is_array( $el['settings'] ) ? $el['settings'] : array();
             return array(
                 'type'         => $el['widgetType'],
                 'title'        => isset( $s['title'] ) && is_string( $s['title'] ) ? $s['title'] : '',
                 'header_size'  => isset( $s['header_size'] ) ? (string) $s['header_size'] : '',
             );
         }
         if ( ! empty( $el['elements'] ) && is_array( $el['elements'] ) ) {
             $found = ch_seo_el_heading_info( $el['elements'] );
             if ( $found ) { return $found; }
         }
     }
     return null;
 }
 function ch_seo_el_apply_h1( &$elements, $value, $size, &$changed ) {
     foreach ( $elements as &$el ) {
         if ( ! is_array( $el ) ) { continue; }
         if ( ch_seo_el_is_heading( $el ) ) {
             if ( ! isset( $el['settings'] ) || ! is_array( $el['settings'] ) ) { $el['settings'] = array(); }
             $el['settings']['header_size'] = $size;
             $dynamic = ! empty( $el['settings']['__dynamic__']['title'] );
             if ( 'heading' === $el['widgetType'] && ! $dynamic && is_string( $value ) ) {
                 $el['settings']['title'] = $value;
             }
             $changed = true;
             return true;
         }
         if ( ! empty( $el['elements'] ) && is_array( $el['elements'] ) && ch_seo_el_apply_h1( $el['elements'], $value, $size, $changed ) ) {
             return true;
         }
     }
     unset( $el );
     return false;
 }
 function ch_seo_h1_from_html( $html ) {
     if ( preg_match( '/<h1\b[^>]*>([\s\S]*?)<\/h1>/i', (string) $html, $m ) ) {
         return trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( $m[1] ) ) );
     }
     return '';
 }
 function ch_seo_h1_get( $id ) {
     $stored = get_post_meta( $id, '_ch_seo_h1', true );
     if ( is_string( $stored ) && '' !== $stored ) { return $stored; }
     $post = get_post( $id );
     $from_content = $post ? ch_seo_h1_from_html( $post->post_content ) : '';
     if ( '' !== $from_content ) { return $from_content; }
     $info = ch_seo_el_heading_info( ch_seo_el_elements( $id ) );
     if ( $info && 'h1' === strtolower( $info['header_size'] ) && '' !== $info['title'] ) { return $info['title']; }
     return '';
 }
 function ch_seo_h1_set( $id, $value ) {
     $post = get_post( $id );
     if ( ! $post ) { return new WP_Error( 'not_found', 'No such post', array( 'status' => 404 ) ); }
     $value = sanitize_text_field( (string) $value );
     if ( strlen( $value ) > 200 ) { $value = substr( $value, 0, 200 ); }
     if ( '' === $value ) {
         $backup = get_post_meta( $id, '_ch_seo_h1_backup', true );
         delete_post_meta( $id, '_ch_seo_h1' );
         if ( is_array( $backup ) ) {
             if ( ch_seo_is_builder( $id ) ) {
                 $elements = ch_seo_el_elements( $id );
                 $changed  = false;
                 $size     = ( isset( $backup['header_size'] ) && '' !== $backup['header_size'] ) ? $backup['header_size'] : 'h2';
                 ch_seo_el_apply_h1( $elements, isset( $backup['title'] ) ? (string) $backup['title'] : '', $size, $changed );
                 if ( $changed ) { ch_seo_el_save( $id, $elements ); }
             } elseif ( isset( $backup['content'] ) ) {
                 wp_update_post( wp_slash( array( 'ID' => $id, 'post_content' => $backup['content'] ) ) );
             }
             delete_post_meta( $id, '_ch_seo_h1_backup' );
         }
         clean_post_cache( $id );
         do_action( 'ch_seo_meta_updated', $id );
         return array( 'h1' => '' );
     }
     if ( ! get_post_meta( $id, '_ch_seo_h1_backup', true ) ) {
         $info = ch_seo_el_heading_info( ch_seo_el_elements( $id ) );
         update_post_meta( $id, '_ch_seo_h1_backup', array(
             'title'        => $info ? (string) $info['title'] : '',
             'header_size'  => $info ? (string) $info['header_size'] : '',
             'content'      => (string) $post->post_content,
         ) );
     }
     update_post_meta( $id, '_ch_seo_h1', $value );
     if ( ch_seo_is_builder( $id ) ) {
         $elements = ch_seo_el_elements( $id );
         $changed  = false;
         ch_seo_el_apply_h1( $elements, $value, 'h1', $changed );
         if ( $changed ) { ch_seo_el_save( $id, $elements ); }
     } else {
         $raw  = (string) $post->post_content;
         $safe = esc_html( $value );
         $next = preg_match( '/<h1\b/i', $raw )
             ? preg_replace( '/<h1\b[^>]*>[\s\S]*?<\/h1>/i', '<h1>' . $safe . '</h1>', $raw, 1 )
             : '<h1>' . $safe . '</h1>' . "\n" . $raw;
         if ( $next !== $raw ) {
             wp_update_post( wp_slash( array( 'ID' => $id, 'post_content' => $next ) ) );
         }
     }
     clean_post_cache( $id );
     do_action( 'ch_seo_meta_updated', $id );
     return array( 'h1' => $value );
 }
 add_action( 'rest_api_init', function () {
     register_rest_route( 'ch-seo/v1', '/h1/(?P<id>\d+)', array(
         array( 'methods' => 'GET', 'permission_callback' => 'ch_seo_can_edit',
             'callback' => function ( WP_REST_Request $r ) {
                 $id = (int) $r['id'];
                 if ( ! get_post( $id ) ) { return new WP_Error( 'not_found', 'No such post', array( 'status' => 404 ) ); }
                 return array( 'h1' => ch_seo_h1_get( $id ), 'builder' => ch_seo_is_builder( $id ) );
             } ),
         array( 'methods' => 'POST', 'permission_callback' => 'ch_seo_can_edit',
             'callback' => function ( WP_REST_Request $r ) {
                 return ch_seo_h1_set( (int) $r['id'], (string) $r->get_param( 'value' ) );
             } ),
     ) );
 } );
 add_action( 'elementor/frontend/widget/before_render', function ( $widget ) {
     if ( is_admin() || ! is_singular() ) { return; }
     $id = get_queried_object_id();
     $h1 = (string) get_post_meta( $id, '_ch_seo_h1', true );
     if ( '' === $h1 ) { return; }
     $name = $widget->get_name();
     if ( 'heading' !== $name && 'theme-post-title' !== $name ) { return; }
     if ( ! empty( $GLOBALS['ch_seo_h1_printed'] ) ) { return; }
     $GLOBALS['ch_seo_h1_printed'] = true;
     $widget->set_settings( 'header_size', 'h1' );
     if ( 'heading' === $name ) { $widget->set_settings( 'title', $h1 ); }
     if ( 'theme-post-title' === $name ) {
         $once = null;
         $once = function ( $title, $post_id ) use ( $h1, $id, &$once ) {
             if ( $once ) { remove_filter( 'the_title', $once, 20 ); }
             return ( (int) $post_id === (int) $id ) ? $h1 : $title;
         };
         add_filter( 'the_title', $once, 20, 2 );
     }
 } );
 add_filter( 'elementor/frontend/the_content', function ( $content ) {
     if ( ! empty( $GLOBALS['ch_seo_h1_printed'] ) || ! is_singular() ) { return $content; }
     $id = get_queried_object_id();
     $h1 = (string) get_post_meta( $id, '_ch_seo_h1', true );
     if ( '' === $h1 ) { return $content; }
     $GLOBALS['ch_seo_h1_printed'] = true;
     return '<h1 class="ch-seo-h1">' . esc_html( $h1 ) . '</h1>' . $content;
 }, 5 );
