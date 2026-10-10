<?php
 /**
  * Plugin Name: CreativHeads SEO Connector
  * Description: Small, reviewed bridge for SEO Studio: reads and writes SEO titles, meta descriptions and noindex
  *              through the active SEO plugin (Yoast or Rank Math), adds JSON-LD schema, and serves 301 redirects
  *              for URLs that would otherwise 404. No outbound calls, no tracking, no settings page.
  * Version:     1.0.0
  * Author:      DIGI CREATIVHEADS LLP
  * Requires PHP: 7.4
  */
 if ( ! defined( 'ABSPATH' ) ) { exit; }

 const CH_SEO_VERSION = '1.0.0';
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
         );
     }
     if ( 'rank_math' === $p ) {
         $robots = ch_seo_arr( get_post_meta( $id, 'rank_math_robots', true ) );
         return array(
             'plugin'      => $p,
             'title'       => (string) get_post_meta( $id, 'rank_math_title', true ),
             'description' => (string) get_post_meta( $id, 'rank_math_description', true ),
             'noindex'     => in_array( 'noindex', $robots, true ),
         );
     }
     return array( 'plugin' => 'none', 'title' => '', 'description' => '', 'noindex' => false );
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
